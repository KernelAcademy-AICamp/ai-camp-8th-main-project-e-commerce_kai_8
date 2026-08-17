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


def load(path: str) -> tuple[dict[str, int], set[str]]:
    """등급과 needsImage 표시를 함께 읽는다."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = doc["grades"] if isinstance(doc, dict) else doc
    return (
        {r["itemId"]: r["grade"] for r in rows},
        {r["itemId"] for r in rows if r.get("needsImage")},
    )


def wilson(successes: int, total: int) -> tuple[float, float]:
    """정확 일치 비율의 95% 신뢰구간 (Wilson). 표본이 작아 정규근사는 쓰지 않는다."""
    if total == 0:
        return (0.0, 0.0)
    z = 1.96
    phat = successes / total
    denom = 1 + z * z / total
    centre = (phat + z * z / (2 * total)) / denom
    margin = z * ((phat * (1 - phat) / total + z * z / (4 * total * total)) ** 0.5) / denom
    return (max(0.0, centre - margin), min(1.0, centre + margin))


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

    ga, need_a = load(args.a)
    gb, need_b = load(args.b)
    needs_image = need_a | need_b
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

    # 계열별 일치도와 신뢰구간 — 계열마다 규칙이 달라 한 숫자로 합치면 가려진다.
    # itemId 앞부분(queryId)으로는 계열을 알 수 없어 질의 세트에서 끌어온다.
    qset = json.loads((EVAL_DIR / "query-set.json").read_text(encoding="utf-8"))
    bucket_of = {e["id"]: e["bucket"] for e in qset["entries"]}
    by_bucket: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for iid in shared:
        b = bucket_of.get(iid.rsplit("-", 1)[0])
        if b:
            by_bucket[b].append((ga[iid], gb[iid]))
    per_bucket = []
    for bucket, ps in sorted(by_bucket.items()):
        hits = sum(1 for a, b in ps if a == b)
        lo, hi = wilson(hits, len(ps))
        per_bucket.append(
            {
                "bucket": bucket, "items": len(ps),
                "exact": hits / len(ps), "ci95": [lo, hi],
                "qwk": quadratic_weighted_kappa(ps),
            }
        )

    # 이미지가 필요하다고 표시된 항목은 따로 본다 — 텍스트 채점의 한계가
    # 실제로 나타나는지 확인하는 자리다 (설계 §8.4)
    img_pairs = [(ga[i], gb[i]) for i in shared if i in needs_image]
    image_dependent = {
        "items": len(img_pairs),
        "exact": (sum(1 for a, b in img_pairs if a == b) / len(img_pairs)) if img_pairs else None,
        "note": "표시가 적으면 판단 불가 — 사람 판정을 정본으로 삼을지 결정할 근거가 부족하다는 뜻",
    }

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
        "perBucket": per_bucket,
        "imageDependent": image_dependent,
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
    print("\n계열별 정확 일치 (95% 신뢰구간):")
    for row in per_bucket:
        print(
            f"  {row['bucket']:<4} {row['items']:>3}개  {row['exact']:>6.1%}"
            f"  [{row['ci95'][0]:.1%}~{row['ci95'][1]:.1%}]  κ {row['qwk']:.3f}"
        )
    print(
        f"\n이미지 필요 표시 항목: {image_dependent['items']}개"
        + (f" · 정확 일치 {image_dependent['exact']:.1%}" if image_dependent["exact"] is not None else " (판단 불가)")
    )
    print(f"\n불일치 {len(disagreements)}건 · 질의별 평균 등급 차이가 큰 순:")
    for row in sorted(per_query, key=lambda r: -abs(r["diff"]))[:5]:
        print(
            f"  {row['queryId']:<12} 항목 {row['items']:>3}  "
            f"A평균 {row['meanA']:.2f} / B평균 {row['meanB']:.2f}  차이 {row['diff']:+.2f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
