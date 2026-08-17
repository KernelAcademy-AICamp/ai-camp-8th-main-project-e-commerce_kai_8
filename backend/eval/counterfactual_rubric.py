"""개선분을 **코드 몫**과 **채점 기준 변경 몫**으로 가른다.

중간에 기준서를 v3(색 라벨을 채점자에게 보여준다)으로 올렸다. 그러면 검색이
좋아진 것과 측정이 덜 가려진 것이 한 숫자에 섞인다. 갈라서 재야 정직하다.

방법: 지금 판정 중 **제목만으로는 색을 확인할 수 없었을 항목**(등급 2인데 제목에
질의의 색 표현이 없는 것)을 등급 1로 되돌려 다시 계산한다. 그것이 "옛 기준으로
채점했다면" 값이다. 되돌린 itemId 목록을 함께 출력해 검증할 수 있게 한다.

⚠️ 근사다. 실제 v2 채점자가 무엇을 봤을지 재현하는 것이 아니라, **색을 라벨로
확인한 덕에 2가 된 항목**을 상한으로 잡아 되돌리는 것이다. 따라서 이 값은
"코드 몫의 하한"으로 읽어야 한다.

실행:
  python backend/eval/counterfactual_rubric.py                 # 요약
  python backend/eval/counterfactual_rubric.py --list          # 되돌린 항목까지
"""

from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "docs" / "atee" / "eval"

# 질의에 이 말이 있으면, 제목에 오른쪽 패턴이 없을 때 "제목으로 확인 불가"로 본다
COLOR_IN_TITLE = {
    "블랙": r"블랙|black",
    "검정": r"검정|블랙|black",
    "흰": r"흰|화이트|white",
    "네이비": r"네이비|navy",
    "아이보리": r"아이보리|ivory",
    "노란": r"노란|노랑|옐로우|yellow",
    "파란": r"파란|파랑|블루|blue",
    "회색": r"회색|그레이|gray|grey",
}

GRADE_FILES = [
    "grading-codex-all.json", "grading-codex-a-new.json", "grading-codex-a2.json",
    "grading-codex-a3.json", "grading-codex-typo.json", "grading-codex-cat.json",
    "grading-codex-color.json", "grading-codex-color2.json", "grading-codex-color3.json",
    "grading-codex-range.json", "grading-codex-price.json",
]


def load_grades() -> dict[str, int]:
    grades: dict[str, int] = {}
    for name in GRADE_FILES:
        doc = json.loads((EVAL_DIR / name).read_text(encoding="utf-8"))
        rows = doc if isinstance(doc, list) else doc.get("items", [])
        for row in rows:
            if row.get("grade") is not None:
                grades[row["itemId"]] = row["grade"]
    return grades


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", default="G4")
    parser.add_argument("--partition", default="dev")
    parser.add_argument("--list", action="store_true", help="되돌린 항목을 모두 출력")
    args = parser.parse_args()

    grades = load_grades()
    queries = {q["id"]: q for q in json.loads((EVAL_DIR / "query-set.json").read_text(encoding="utf-8"))["entries"]}
    pool = {q["id"]: q for q in json.loads((EVAL_DIR / "pool-a.json").read_text(encoding="utf-8"))["queries"]}

    reverted: list[tuple[str, str]] = []

    def grade_of(qid: str, cand: dict, blind: bool) -> int:
        grade = grades.get(f"{qid}-{cand['goodsNo']}", 0)
        if not blind or grade != 2:
            return grade
        text = queries[qid]["query"]
        for word, pattern in COLOR_IN_TITLE.items():
            if word in text and not re.search(pattern, cand["title"], re.I):
                reverted.append((f"{qid}-{cand['goodsNo']}", cand["title"]))
                return 1
        return grade

    out = {}
    for blind in (False, True):
        reverted.clear()
        scores = []
        for qid, entry in pool.items():
            meta = queries[qid]
            if meta["bucket"] != args.bucket or meta["partition"] != args.partition:
                continue
            hits = sum(1 for c in entry["candidates"][:20] if grade_of(qid, c, blind) == 2)
            scores.append(hits / 20)
        out["옛 기준 가정" if blind else "지금 (v3.1)"] = (
            100 * sum(scores) / len(scores), len(scores), list(reverted)
        )

    print(f"{args.bucket} / {args.partition} 파티션")
    for label, (value, n, rev) in out.items():
        print(f"  {label:16} P@20 = {value:5.1f}%   (질의 {n}개, 되돌린 판정 {len(rev)}건)")
    diff = out["지금 (v3.1)"][0] - out["옛 기준 가정"][0]
    print(f"\n  채점 기준 변경이 더한 몫: {diff:+.1f}pt")
    print("  나머지는 코드 몫이다. 0건이던 질의가 결과를 내게 된 부분은 어떤 기준에서도 0 → 양수다.")

    if args.list:
        print("\n되돌린 판정 (제목만으로는 색을 확인할 수 없다):")
        for item_id, title in out["옛 기준 가정"][2]:
            print(f"  {item_id}  {title[:56]}")
    else:
        counts = collections.Counter(i.rsplit("-", 1)[0] for i, _ in out["옛 기준 가정"][2])
        print("\n되돌린 판정의 질의별 분포:", dict(counts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
