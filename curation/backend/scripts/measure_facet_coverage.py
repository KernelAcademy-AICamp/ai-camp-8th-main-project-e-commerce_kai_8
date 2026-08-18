"""P3-T0 축별 메타 충전율 측정 (hard-safe 기준 1).

search_goods 뷰(검색이 실제 조회하는 최종 값)를 주 판정 대상으로,
축별 원시/유효 충전율과 값 분포를 출력한다. m_raw_facets는 원인 진단 보조.

- 사이즈 유효 충전 = size_std 비어있지 않음 OR size_free 참 (build-goods-query.ts 시맨틱스).
- 유효 충전율 = 무의미 값("기타색상")을 빈 값으로 취급한 비율. 원시/유효 병기.
- --snapshot 지정 시 정답 판정 최소 컬럼의 불변 export(JSON)와 sha256을 함께 기록한다.

실행: backend/ 에서  ./venv/bin/python scripts/measure_facet_coverage.py \
        [--snapshot ../docs/p3-t0/search-goods-snapshot-YYYYMMDD.json]
(backend/backups/ 는 gitignore 대상이므로 커밋용 스냅샷은 docs/p3-t0/ 에 둔다)
service 키 필요(search_goods는 anon도 읽히지만 스크립트는 기존 관례를 따른다).
"""

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from supabase import create_client

# 검색이 실제 조회하는 컬럼(스냅샷·측정 공용). build-goods-query.ts 하드필터 대상과 일치.
SNAPSHOT_COLUMNS = [
    "goods_no", "title", "brand", "colors", "patterns", "materials", "fits",
    "gender", "size_std", "size_free", "price",
]
ARRAY_AXES = ["colors", "patterns", "materials", "fits"]
# 채워졌지만 검색 가치가 없는 값 — 유효 충전율에서 빈 값으로 취급.
MEANINGLESS = {"colors": {"기타색상"}, "patterns": set(), "materials": set(), "fits": set()}
THRESHOLD = 0.90  # 설계 §3.2 기준 1: 충전율 ≥90% (빈 비율 ≤10%)
PAGE = 1000  # PostgREST max_rows


def load_env(path: str) -> None:
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k, v.strip().strip('"').strip("'"))


def fetch_all(sb):
    rows, start = [], 0
    while True:
        page = (
            sb.table("search_goods")
            .select(",".join(SNAPSHOT_COLUMNS))
            .order("goods_no")
            .range(start, start + PAGE - 1)
            .execute()
            .data
        )
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        start += PAGE


def axis_stats(rows):
    total = len(rows)
    out = {}
    for axis in ARRAY_AXES:
        raw = sum(1 for r in rows if r.get(axis))
        effective = sum(
            1 for r in rows if set(r.get(axis) or []) - MEANINGLESS[axis]
        )
        dist = {}
        for r in rows:
            for v in r.get(axis) or []:
                dist[v] = dist.get(v, 0) + 1
        values_per_row = sum(len(r.get(axis) or []) for r in rows) / total
        out[axis] = {
            "raw_filled": raw,
            "effective_filled": effective,
            "top_values": sorted(dist.items(), key=lambda x: -x[1])[:5],
            "values_per_row": round(values_per_row, 2),
        }
    gender = sum(1 for r in rows if r.get("gender"))
    out["gender"] = {"raw_filled": gender, "effective_filled": gender}
    std = sum(1 for r in rows if r.get("size_std"))
    free = sum(1 for r in rows if r.get("size_free"))
    size_eff = sum(1 for r in rows if r.get("size_std") or r.get("size_free"))
    out["size"] = {
        "raw_filled": size_eff,
        "effective_filled": size_eff,
        "size_std_only": std,
        "size_free_only": free,
    }
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", help="정답 판정용 불변 export(JSON) 저장 경로")
    args = ap.parse_args()

    load_env(str(Path(__file__).resolve().parents[1] / ".env.local"))
    url = os.environ["SUPABASE_URL"]
    sb = create_client(url, os.environ["SUPABASE_SECRET_KEY"])
    rows = fetch_all(sb)
    total = len(rows)
    ran_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

    print(f"# P3-T0 충전율 측정")
    print(f"- 실행 시각(UTC): {ran_at}")
    print(f"- 환경: {urlparse(url).hostname}")
    print(f"- 분모: search_goods 전체(searchable 상품) = {total}행")
    print(f"- 기준: 충전율 ≥{THRESHOLD:.0%} (원시=값 존재 / 유효=무의미 값 제외)")
    print()
    print("| 축 | 원시 충전 | 원시 % | 유효 충전 | 유효 % | 기준1(유효) | 비고 |")
    print("|---|---|---|---|---|---|---|")
    stats = axis_stats(rows)
    for axis, s in stats.items():
        raw_pct = s["raw_filled"] / total
        eff_pct = s["effective_filled"] / total
        verdict = "통과" if eff_pct >= THRESHOLD else "미달"
        note = ""
        if axis == "size":
            note = f"size_std {s['size_std_only']} · size_free {s['size_free_only']}"
        elif "values_per_row" in s:
            note = f"행당 {s['values_per_row']}개"
        print(
            f"| {axis} | {s['raw_filled']} | {raw_pct:.1%} | "
            f"{s['effective_filled']} | {eff_pct:.1%} | {verdict} | {note} |"
        )
    print()
    for axis in ARRAY_AXES:
        top = ", ".join(f"{v}({n})" for v, n in stats[axis]["top_values"])
        print(f"- {axis} 상위 값: {top}")

    if args.snapshot:
        payload = json.dumps(
            {"ran_at": ran_at, "env": urlparse(url).hostname, "total": total, "rows": rows},
            ensure_ascii=False, sort_keys=True, indent=1,
        )
        digest = hashlib.sha256(payload.encode()).hexdigest()
        Path(args.snapshot).write_text(payload)
        print(f"\n- 스냅샷: {args.snapshot} ({total}행, sha256={digest[:16]}…)")
        print(f"- sha256 전체: {digest}")


if __name__ == "__main__":
    main()
