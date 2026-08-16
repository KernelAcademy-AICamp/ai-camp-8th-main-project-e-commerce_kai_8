"""채점자 일치도 — 순서 있는 3단계 등급에 맞는 지표로 잰다 (계획 5단계).

단순 Cohen's κ를 쓰지 않는 이유(2차 리뷰 Major 10): 등급이 0<1<2로 순서가 있는데
단순 κ는 2와 1의 차이를 2와 0의 차이와 같게 취급한다. 이차 가중 κ를 쓴다.

표집 단위는 질의다 — 같은 질의의 상품 20개는 강하게 상관돼 독립 표본이 아니다.
그래서 항목 단위 일치도와 함께 질의 단위 평균 등급 차이도 낸다.

실행:
  python backend/eval/agreement.py --a docs/atee/eval/grading-codex-dev.json \
                                   --b docs/atee/eval/grading-claude-anchor.json
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "docs" / "atee" / "eval"
LEVELS = [0, 1, 2]


def load(path: str) -> dict[str, int]:
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = doc["grades"] if isinstance(doc, dict) else doc
    return {r["itemId"]: r["grade"] for r in rows}


def quadratic_weighted_kappa(pairs: list[tuple[int, int]]) -> float:
    n = len(pairs)
    if n == 0:
        return float("nan")
    obs = defaultdict(int)
    for a, b in pairs:
        obs[(a, b)] += 1
    ca, cb = Counter(a for a, _ in pairs), Counter(b for _, b in pairs)

    max_d2 = (len(LEVELS) - 1) ** 2
    num = den = 0.0
    for i in LEVELS:
        for j in LEVELS:
            w = ((i - j) ** 2) / max_d2
            num += w * obs[(i, j)]
            den += w * (ca[i] * cb[j] / n)
    if den == 0:
        return 1.0
    return 1 - num / den


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--a", required=True, help="채점자 A (예: Codex)")
    parser.add_argument("--b", required=True, help="채점자 B (예: 앵커)")
    parser.add_argument("--out", default=str(EVAL_DIR / "agreement.json"))
    args = parser.parse_args()

    ga, gb = load(args.a), load(args.b)
    shared = sorted(set(ga) & set(gb))
    pairs = [(ga[i], gb[i]) for i in shared]

    exact = sum(1 for a, b in pairs if a == b) / len(pairs)
    adjacent = sum(1 for a, b in pairs if abs(a - b) <= 1) / len(pairs)
    qwk = quadratic_weighted_kappa(pairs)

    # 질의 단위 — itemId는 "<queryId>-<goodsNo>" 형태
    by_query: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for iid in shared:
        by_query[iid.rsplit("-", 1)[0]].append((ga[iid], gb[iid]))

    per_query = []
    for qid, ps in sorted(by_query.items()):
        ma = sum(a for a, _ in ps) / len(ps)
        mb = sum(b for _, b in ps) / len(ps)
        per_query.append(
            {"queryId": qid, "items": len(ps), "meanA": ma, "meanB": mb, "diff": ma - mb}
        )

    disagreements = [
        {"itemId": i, "a": ga[i], "b": gb[i]} for i in shared if ga[i] != gb[i]
    ]

    result = {
        "meta": {
            "a": args.a, "b": args.b,
            "sharedItems": len(shared),
            "metric": "이차 가중 κ (순서 반영). 단순 κ는 등급 간 거리를 무시해 쓰지 않는다.",
            "caveat": (
                "⚠️ 두 채점자가 모두 AI라면 이것은 설계 §8.4가 요구하는 인간 앵커가 아니다. "
                "같은 종류의 편향을 공유할 수 있어, 사람 채점으로 다시 확인하기 전에는 "
                "이 수치로 하네스를 신뢰해선 안 된다."
            ),
        },
        "exactAgreement": exact,
        "adjacentAgreement": adjacent,
        "quadraticWeightedKappa": qwk,
        "perQuery": per_query,
        "disagreements": disagreements,
    }
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"공통 항목 {len(shared)}건")
    print(f"  정확 일치      {exact:.1%}")
    print(f"  ±1 이내 일치   {adjacent:.1%}")
    print(f"  이차 가중 κ    {qwk:.3f}")
    print(f"\n분포 A: {dict(sorted(Counter(a for a, _ in pairs).items()))}")
    print(f"분포 B: {dict(sorted(Counter(b for _, b in pairs).items()))}")
    print(f"\n불일치 {len(disagreements)}건 · 질의별 평균 등급 차이가 큰 순:")
    for row in sorted(per_query, key=lambda r: -abs(r["diff"]))[:5]:
        print(
            f"  {row['queryId']:<12} 항목 {row['items']:>3}  "
            f"A평균 {row['meanA']:.2f} / B평균 {row['meanB']:.2f}  차이 {row['diff']:+.2f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
