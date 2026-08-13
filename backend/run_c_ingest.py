"""c_* 전체 수집 러너. 중단·재개 가능.

계획: docs/superpowers/plans/2026-08-11-musinsa-c-db-ingest.md 단계 5·8

두 단계로 나뉜다.
  A. 모수 확정 — 카테고리를 가격 구간으로 쪼개 goodsNo를 먼저 전부 확보해 고정한다.
     수집 도중 무신사 목록 순서가 바뀌어도 누락·중복이 생기지 않게 하기 위함이다.
  B. 상세 수집 — 아직 끝나지 않은 상품만 골라 받고, 작은 묶음마다 저장하고 메모리를 비운다.

재개는 c_ingest_state를 보고 판단한다. 이미 성공한 엔드포인트는 다시 부르지 않는다.

사용:
  venv/bin/python run_c_ingest.py plan  --run-id r1
  venv/bin/python run_c_ingest.py fetch --run-id r1 [--workers 12] [--limit N]
  venv/bin/python run_c_ingest.py status --run-id r1
"""
import argparse
import sys
import time

import psycopg

from db.c_upsert import upsert_c_raw_goods
from musinsa.c_landing import ENDPOINTS, fetch_c_batch
from musinsa.c_shards import musinsa_count_fn, plan_price_shards, shard_id
from musinsa.client import MusinsaClient

CATEGORIES = ["001001", "001010", "001011", "001003", "001004"]
DEFAULT_DSN = "postgresql://postgres@127.0.0.1:55432/c_verify"

# 목록 API 상한은 1000페이지(=10만개)다. 수집 중 카탈로그가 늘어도 걸리지 않도록 여유를 둔다.
SHARD_LIMIT = 90_000
_TERMINAL = ("success", "permanent", "not_applicable")


# ── A. 모수 확정 ─────────────────────────────────────────────────────────────
def plan(conn, mc, run_id: str, categories: list[str], *, page_sleep: float = 0.1) -> int:
    conn.execute(
        "insert into c_ingest_run (run_id, categories, params) values (%s, %s, %s) "
        "on conflict (run_id) do nothing",
        (run_id, categories, psycopg.types.json.Jsonb({"shard_limit": SHARD_LIMIT})))
    conn.commit()

    total = 0
    for cat in categories:
        shards = plan_price_shards(musinsa_count_fn(mc, cat), limit=SHARD_LIMIT)
        for lo, hi in shards:
            sid = shard_id(lo, hi)
            extra: dict = {"minPrice": lo}
            if hi is not None:
                extra["maxPrice"] = hi
            expected = mc.list_page(cat, 1, size=1, extra=extra)["pagination"]["totalCount"]
            got, page = 0, 1
            while True:
                data = mc.list_page(cat, page, size=100, extra=extra)
                items = data.get("list") or []
                if not items:
                    break
                valid = [it for it in items if it.get("goodsNo")]
                rows = [(run_id, it["goodsNo"], cat, sid) for it in valid]
                with conn.cursor() as cur:
                    cur.executemany(
                        "insert into c_ingest_target (run_id, goods_no, category, shard) "
                        "values (%s,%s,%s,%s) on conflict (run_id, goods_no) do nothing", rows)
                conn.commit()
                # PLP 카드를 여기서 저장해 둔다. B단계의 리뷰 게이팅이 reviewCount를 알아야 하고,
                # 저장하지 않으면 리뷰 0건 상품에도 survey·ai_summary를 부르게 된다(모수의 절반).
                upsert_c_raw_goods(
                    conn, [{"goods_no": it["goodsNo"], "plp": it} for it in valid],
                    ingest_tag=run_id)
                got += len(rows)
                if not data.get("pagination", {}).get("hasNext"):
                    break
                page += 1
                time.sleep(page_sleep)
            gap = expected - got
            flag = "  ⚠️ 상한 의심" if page >= 1000 else ("  ⚠️ 누락" if gap > expected * 0.01 else "")
            print(f"  {cat} {sid:>16}: 기대 {expected:>7,} / 수집 {got:>7,} "
                  f"(차이 {gap:+,}) 페이지 {page}{flag}", flush=True)
            total += got
    return total


# ── B. 상세 수집 ─────────────────────────────────────────────────────────────
_PENDING_SQL = f"""
select t.goods_no
from c_ingest_target t
left join (
  select goods_no, count(*) filter (where state in {_TERMINAL}) as done
  from c_ingest_state where run_id = %(run)s group by goods_no
) s on s.goods_no = t.goods_no
where t.run_id = %(run)s and coalesce(s.done, 0) < %(n_ep)s
order by t.goods_no
limit %(lim)s
"""


def pending_goods(conn, run_id: str, limit: int) -> list[int]:
    return [r[0] for r in conn.execute(
        _PENDING_SQL, {"run": run_id, "n_ep": len(ENDPOINTS), "lim": limit}).fetchall()]


def _record_state(conn, run_id: str, rows: list[dict]) -> None:
    params = []
    for row in rows:
        for ep, st in row["source_status"].items():
            params.append((run_id, row["goods_no"], ep, st["state"], st.get("error"), st.get("http")))
    with conn.cursor() as cur:
        cur.executemany(
            "insert into c_ingest_state "
            "  (run_id, goods_no, endpoint, state, attempts, last_error, last_status) "
            "values (%s,%s,%s,%s,1,%s,%s) "
            "on conflict (run_id, goods_no, endpoint) do update set "
            "  state = excluded.state, attempts = c_ingest_state.attempts + 1, "
            "  last_error = excluded.last_error, last_status = excluded.last_status, "
            "  updated_at = now()", params)
    conn.commit()


def fetch(conn, mc, run_id: str, *, workers: int = 12, batch: int = 100,
          limit: int | None = None) -> int:
    done, t0 = 0, time.time()
    while True:
        take = batch if limit is None else min(batch, limit - done)
        if take <= 0:
            break
        goods = pending_goods(conn, run_id, take)
        if not goods:
            break
        plps = conn.execute(
            "select plp from c_raw_goods where goods_no = any(%s)", (goods,)).fetchall()
        known = {p[0]["goodsNo"]: p[0] for p in plps if p[0]}
        missing = [g for g in goods if g not in known]
        if missing:
            # PLP 카드가 없으면 리뷰 게이팅을 판단할 수 없다. 모수 확정 단계가 저장하므로
            # 정상 경로에서는 비어 있어야 한다. 조용히 넘기지 않고 드러낸다.
            print(f"    ⚠️ PLP 없는 상품 {len(missing)}개 — 리뷰 게이팅 없이 전량 호출", flush=True)
        items = [known.get(g) or {"goodsNo": g, "reviewCount": 1} for g in goods]
        rows = fetch_c_batch(mc, items, workers=workers)
        upsert_c_raw_goods(conn, rows, ingest_tag=run_id)
        _record_state(conn, run_id, rows)
        done += len(rows)
        rate = done / max(time.time() - t0, 0.001)
        print(f"  {done:,}개 완료 · {rate:.1f}개/초", flush=True)
    return done


def status(conn, run_id: str) -> None:
    tgt = conn.execute("select count(*) from c_ingest_target where run_id=%s", (run_id,)).fetchone()[0]
    stored = conn.execute("select count(*) from c_raw_goods").fetchone()[0]
    print(f"모수 {tgt:,} · 적재 {stored:,} · 남은 {len(pending_goods(conn, run_id, 10**9)):,}")
    for ep, st, n in conn.execute(
            "select endpoint, state, count(*) from c_ingest_state where run_id=%s "
            "group by 1,2 order by 1,2", (run_id,)).fetchall():
        print(f"  {ep:<12} {st:<16} {n:>8,}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["plan", "fetch", "status"])
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--dsn", default=DEFAULT_DSN)
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--categories", nargs="*", default=CATEGORIES)
    a = ap.parse_args()

    mc = MusinsaClient()
    with psycopg.connect(a.dsn) as conn:
        if a.command == "plan":
            print(f"모수 확정 {a.run_id} — {plan(conn, mc, a.run_id, a.categories):,}개")
        elif a.command == "fetch":
            n = fetch(conn, mc, a.run_id, workers=a.workers, limit=a.limit)
            print(f"수집 {n:,}개")
        else:
            status(conn, a.run_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
