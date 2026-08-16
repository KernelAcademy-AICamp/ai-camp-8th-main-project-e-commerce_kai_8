"""기준선 후보 풀 생성 — 현재 검색으로 전 질의의 상위 결과를 모은다.

계획: docs/plans/2026-08-17-search-eval-harness.md 4단계

풀링(설계 §8.2): 22.6만 상품을 전수 판정할 수 없으므로, 비교 대상 시스템들의
상위 결과만 모아 그 풀을 판정하고 이후 단계에서 재사용한다. 0단계의 첫 풀은
현재 검색(c_search_page) 결과만으로 만들어진다.

⚠️ 미판정 처리 규칙은 **기준선을 재기 전에** 못박는다(2차 리뷰 Major 8).
나중에 정하면 신규 시스템에 유리하거나 불리하게 고르게 된다. 규칙은 아래
UNJUDGED_POLICY 상수와 산출물 meta에 함께 박아 둔다.

실행:
  python backend/eval/build_pool.py            # 풀 생성 (DB 조회)
  python backend/eval/build_pool.py --summary  # 기존 산출물 요약만
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "docs" / "atee" / "eval"
SET_PATH = EVAL_DIR / "query-set.json"
OUT_PATH = EVAL_DIR / "pool-baseline.json"

TOP_N = 20  # 판정 대상 상위 개수 — P@20·nDCG@20의 K와 같게 맞춘다
SYSTEM = "baseline-c_search_page"

UNJUDGED_POLICY = {
    "onMissingJudgment": "exclude",
    "why": (
        "미판정 상품을 0으로 세면 새 상품을 찾아오는 신규 시스템이 부당하게 불리해진다"
        "(신규 발견을 벌하는 셈). 지표에서 제외하고, 대신 미판정 비율을 항상 함께 보고해"
        "과대평가를 감시한다."
    ),
    "repoolThreshold": 0.30,
    "repoolRule": (
        "어떤 시스템의 상위 20개 중 미판정이 30%를 넘으면 그 시스템의 결과로 풀을 확장하고"
        "새로 들어온 상품만 블라인드로 추가 채점한다. 기존 판정은 재사용한다."
    ),
}

MAX_QUERY_CHARS = 60
MAX_QUERY_WORDS = 5


def normalize_query(raw: str) -> str:
    """프론트·서버 공통 정규화와 같은 규칙 (use-search-state.ts normalizeQuery)."""
    words = [w for w in re.split(r"\s+", raw[:MAX_QUERY_CHARS]) if w]
    return " ".join(words[:MAX_QUERY_WORDS])


def load_db_url() -> str:
    env_path = ROOT / "backend" / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("SUPABASE_DB_URL="):
                return line.split("=", 1)[1].strip().strip("'\"")
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise SystemExit("SUPABASE_DB_URL이 없습니다 (backend/.env.local 또는 환경변수)")
    return url


def build() -> dict:
    import psycopg

    doc = json.loads(SET_PATH.read_text(encoding="utf-8"))
    entries = doc["entries"]

    results: list[dict] = []
    with psycopg.connect(load_db_url()) as conn:
        with conn.cursor() as cur:
            # 카탈로그 스냅샷 표기 — 판정이 어느 시점 카탈로그 기준인지 남긴다
            cur.execute("select count(*) from c_search_text")
            searchable = cur.fetchone()[0]
            cur.execute("select count(*) from c_goods")
            goods = cur.fetchone()[0]

            for e in entries:
                norm = normalize_query(e["query"])
                cur.execute(
                    "select goods_no, title, brand_name, price_final, gender "
                    "from c_search_page(%s, null, %s)",
                    (norm, TOP_N),
                )
                rows = cur.fetchall()
                results.append(
                    {
                        "id": e["id"],
                        "bucket": e["bucket"],
                        "partition": e["partition"],
                        "query": e["query"],
                        "queryNorm": norm,
                        "resultCount": len(rows),
                        "candidates": [
                            {
                                "rank": i,
                                "goodsNo": r[0],
                                "title": r[1],
                                "brandName": r[2],
                                "priceFinal": r[3],
                                "gender": r[4],
                            }
                            for i, r in enumerate(rows)
                        ],
                    }
                )

    return {
        "meta": {
            "purpose": "기준선 후보 풀 — 현재 검색(c_search_page)의 상위 결과. 판정 대상이다.",
            "generatedBy": "backend/eval/build_pool.py",
            "system": SYSTEM,
            "topN": TOP_N,
            "collectedAt": datetime.now(timezone.utc).isoformat(),
            "catalogSnapshot": {
                "c_goods_rows": goods,
                "c_search_text_rows": searchable,
                "note": "카탈로그가 바뀌면 판정이 낡는다 — 재측정 시 이 수치와 비교한다",
            },
            "unjudgedPolicy": UNJUDGED_POLICY,
            "normalization": f"앞 {MAX_QUERY_CHARS}자 → 공백 분리 → 앞 {MAX_QUERY_WORDS}단어 (프론트와 동일)",
        },
        "queries": results,
    }


def summarize(doc: dict) -> None:
    qs = doc["queries"]
    total = len(qs)
    zero = [q for q in qs if q["resultCount"] == 0]

    print(f"질의 {total}건 · 후보 총 {sum(q['resultCount'] for q in qs)}건")
    print(f"0건 질의: {len(zero)}건 ({len(zero) / total:.0%})")
    print()
    print("계열별 0건 비율 (G6은 0건이 정답 — 높을수록 좋다):")
    by_bucket: dict[str, list[dict]] = {}
    for q in qs:
        by_bucket.setdefault(q["bucket"], []).append(q)
    for bucket in sorted(by_bucket):
        items = by_bucket[bucket]
        z = sum(1 for q in items if q["resultCount"] == 0)
        avg = sum(q["resultCount"] for q in items) / len(items)
        flag = "  ← 정답" if bucket == "G6" else ""
        print(
            f"  {bucket}: {len(items):>3}건 중 0건 {z:>2}건 ({z / len(items):>4.0%})"
            f" · 평균 후보 {avg:>4.1f}개{flag}"
        )
    print()
    print("0건이 난 질의 (G6 제외 — 이것이 현재의 실패 목록):")
    for q in zero:
        if q["bucket"] != "G6":
            print(f"  [{q['bucket']}] {q['query']}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", action="store_true", help="재생성 없이 요약만")
    args = parser.parse_args()

    if args.summary:
        doc = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    else:
        doc = build()
        OUT_PATH.write_text(
            json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"생성: {OUT_PATH.relative_to(ROOT)}\n")

    summarize(doc)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
