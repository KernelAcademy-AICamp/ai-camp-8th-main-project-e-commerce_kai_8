"""기준선 지표 계산 — 채점 결과를 실제 순위와 대조해 계열별 점수를 낸다.

계획: docs/plans/2026-08-17-search-eval-harness.md 6단계 · 기준서: docs/atee/eval/rubric.md

지표를 계열 성격에 따라 나눈다(설계 §8.5):
  - 상품 단위(G1~G5·G7·R1): P@20, nDCG@20, 미판정 비율
  - G6: 질의 단위 zero-result 정확도 — 빈 결과를 내야 할 질의에 빈 결과를 냈는가.
    P@20을 쓰면 올바른 빈 결과가 0점이 되고 억지 결과를 낸 시스템이 점수를 얻는다.

등급 1은 P@20에서 적합으로 세지 않는다(기준서 §1). nDCG에서만 부분 이득으로 반영한다.
미판정은 지표에서 제외하고 비율을 따로 보고한다(pool의 unjudgedPolicy).
confidence=low 항목은 주 지표에서 분리한다(기준서 §4).

실행:
  python backend/eval/compute_baseline.py --grades docs/atee/eval/grading-codex-all.json

⚠️ grading-codex-dev.json은 기준서 v1로 매긴 폐기본이다. 섞어 쓰면 안 된다.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "docs" / "atee" / "eval"

K = 20
# 종합 게이트 = 상품 단위 계열의 P@20 평균 (기준서 §1-1).
# G6은 질의 단위 지표라 단위가 달라 합치지 않는다 — 합치면 "원래 못 찾아서 100%"인
# 값이 종합을 밀어올린다(실측: 넣으면 43.4%, 빼면 32.0%). G6은 별도 게이트다.
GATE_BUCKETS = ["G1", "G2", "G3", "G4", "G5", "G7"]  # R1·G6 제외


def dcg(gains: list[int]) -> float:
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))


def compute(pool: dict, grades: dict[str, int], low_conf: set[str]) -> dict:
    per_query: list[dict] = []

    for q in pool["queries"]:
        qid = q["id"]
        if qid in low_conf:
            continue  # 논쟁 케이스는 주 지표에서 분리 (기준서 §4)

        if q["bucket"] == "G6":
            per_query.append(
                {
                    "id": qid,
                    "bucket": "G6",
                    "partition": q["partition"],
                    "kind": "zero_result",
                    "correct": q["resultCount"] == 0,
                }
            )
            continue

        ranked = q["candidates"][:K]
        judged = [(c, grades.get(f"{qid}-{c['goodsNo']}")) for c in ranked]
        known = [g for _, g in judged if g is not None]
        unjudged = len(judged) - len(known)

        if not ranked:
            # 결과가 없는 질의 — 상품 단위 지표는 0이다 (G6이 아니라면 실패다)
            per_query.append(
                {
                    "id": qid, "bucket": q["bucket"], "partition": q["partition"],
                    "kind": "ranked", "p_at_k": 0.0, "ndcg": 0.0,
                    "unjudgedRate": 0.0, "zero": True,
                }
            )
            continue

        # 분모는 항상 K다 (기준서 §1). 반환·판정된 개수로 나누면 결과가 적은
        # 질의가 과대평가된다 — 실측: 결과 1개짜리가 P@20 1.00으로 잡혔다.
        p = sum(1 for g in known if g == 2) / K
        gains = [g for _, g in judged if g is not None]
        ideal = sorted(gains, reverse=True)
        n = (dcg(gains) / dcg(ideal)) if ideal and dcg(ideal) > 0 else 0.0

        per_query.append(
            {
                "id": qid, "bucket": q["bucket"], "partition": q["partition"],
                "kind": "ranked", "p_at_k": p, "ndcg": n,
                "unjudgedRate": unjudged / len(judged), "zero": False,
            }
        )

    by_bucket: dict[str, dict] = {}
    for row in per_query:
        b = by_bucket.setdefault(
            row["bucket"], {"queries": 0, "p": [], "ndcg": [], "unjudged": [], "zero": 0, "correct": 0}
        )
        b["queries"] += 1
        if row["kind"] == "zero_result":
            b["correct"] += int(row["correct"])
        else:
            b["p"].append(row["p_at_k"])
            b["ndcg"].append(row["ndcg"])
            b["unjudged"].append(row["unjudgedRate"])
            b["zero"] += int(row["zero"])

    summary = {}
    for bucket, b in sorted(by_bucket.items()):
        if bucket == "G6":
            summary[bucket] = {
                "metric": "zero_result_accuracy",
                "queries": b["queries"],
                "score": b["correct"] / b["queries"] if b["queries"] else 0.0,
            }
        else:
            n = len(b["p"]) or 1
            summary[bucket] = {
                "metric": "p_at_20",
                "queries": b["queries"],
                "score": sum(b["p"]) / n,
                "ndcg": sum(b["ndcg"]) / n,
                "unjudgedRate": sum(b["unjudged"]) / n,
                "zeroResultRate": b["zero"] / b["queries"],
            }

    gate = [summary[x]["score"] for x in GATE_BUCKETS if x in summary]

    # 파티션별 집계 — A단계는 progress만 열어 비교하므로 같은 표본끼리 봐야 한다
    by_partition: dict[str, dict] = {}
    for row in per_query:
        part = by_partition.setdefault(row["partition"], {})
        b = part.setdefault(row["bucket"], {"queries": 0, "p": [], "correct": 0})
        b["queries"] += 1
        if row["kind"] == "zero_result":
            b["correct"] += int(row["correct"])
        else:
            b["p"].append(row["p_at_k"])
    partition_summary: dict[str, dict] = {}
    for part, buckets in sorted(by_partition.items()):
        rows = {}
        for bucket, b in sorted(buckets.items()):
            rows[bucket] = (
                b["correct"] / b["queries"] if bucket == "G6" else sum(b["p"]) / len(b["p"])
            )
        g = [rows[x] for x in GATE_BUCKETS if x in rows]
        partition_summary[part] = {"perBucket": rows, "gate": sum(g) / len(g) if g else 0.0}

    # 재풀링 필요 판정 — 규칙을 메타로만 두지 않고 실제로 검사한다
    threshold = 0.30
    need_repool = [
        r["id"] for r in per_query
        if r["kind"] == "ranked" and r["unjudgedRate"] > threshold
    ]

    return {
        "perBucket": summary,
        "perPartition": partition_summary,
        "repool": {
            "threshold": threshold,
            "needed": need_repool,
            "verdict": "재풀링 필요" if need_repool else "불필요",
        },
        "overallGate": sum(gate) / len(gate) if gate else 0.0,
        "gateBuckets": [x for x in GATE_BUCKETS if x in summary],
        "excludedFromGate": ["R1", "G6(별도 게이트)"],
        "lowConfidenceExcluded": sorted(low_conf),
        "perQuery": per_query,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--grades", required=True, help="채점 결과 JSON (여러 개 가능, 쉼표 구분)")
    parser.add_argument("--out", default=str(EVAL_DIR / "baseline-scores.json"))
    parser.add_argument("--pool", default=str(EVAL_DIR / "pool-baseline.json"))
    args = parser.parse_args()

    pool = json.loads(Path(args.pool).read_text(encoding="utf-8"))
    qset = json.loads((EVAL_DIR / "query-set.json").read_text(encoding="utf-8"))
    low_conf = {e["id"] for e in qset["entries"] if e.get("confidence") == "low"}

    grades: dict[str, int] = {}
    for path in args.grades.split(","):
        doc = json.loads(Path(path.strip()).read_text(encoding="utf-8"))
        rows = doc["grades"] if isinstance(doc, dict) else doc
        for r in rows:
            grades[r["itemId"]] = r["grade"]

    result = compute(pool, grades, low_conf)
    result["meta"] = {
        "system": pool["meta"]["system"],
        "gradeFiles": args.grades.split(","),
        "judgedItems": len(grades),
        "k": K,
        "note": "등급 1은 P@20에서 적합이 아니다(기준서 §1). G6은 질의 단위 zero-result 정확도.",
    }
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"판정 {len(grades)}건 반영\n")
    print(f"{'계열':<5} {'지표':<22} {'질의':>4} {'점수':>7} {'nDCG':>7} {'0건율':>7} {'미판정':>7}")
    for bucket, s in result["perBucket"].items():
        if s["metric"] == "zero_result_accuracy":
            print(f"{bucket:<5} {'zero-result 정확도':<22} {s['queries']:>4} {s['score']:>7.1%}")
        else:
            print(
                f"{bucket:<5} {'P@20':<22} {s['queries']:>4} {s['score']:>7.1%}"
                f" {s['ndcg']:>7.1%} {s['zeroResultRate']:>7.1%} {s['unjudgedRate']:>7.1%}"
            )
    print(f"\n게이트 종합({'+'.join(result['gateBuckets'])}): {result['overallGate']:.1%}  (목표 70%)")
    print(f"게이트 제외: {result['excludedFromGate']} · 논쟁 분리: {result['lowConfidenceExcluded']}")
    print(f"G6 별도 게이트: {result['perBucket'].get('G6', {}).get('score', 0):.1%} (기준선 대비 하락 시 실패)")
    print("\n파티션별 게이트 종합:")
    for part, s2 in result["perPartition"].items():
        print(f"  {part:<9} {s2['gate']:>6.1%}")
    print(f"\n재풀링: {result['repool']['verdict']} (미판정 30% 초과 질의 {len(result['repool']['needed'])}건)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
