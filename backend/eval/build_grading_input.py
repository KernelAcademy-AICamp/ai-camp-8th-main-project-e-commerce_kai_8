"""채점 입력 생성 — 블라인드·순서 무작위 (계획 5·6단계, 기준서 §6).

채점자에게 주지 않는 것: 어느 시스템이 냈는지, 몇 등이었는지, 질의 의도 설명.
순서를 섞는 이유: 랭킹된 목록을 그대로 보여주면 앞쪽을 후하게 매긴다.
같은 질의의 항목이 붙어 있지 않게 전역으로 섞는다.

지표는 채점이 끝난 뒤 실제 순위와 대조해 계산한다(compute_baseline.py).

⚠️ 풀 경로는 **반드시 지정한다**. 예전엔 pool-baseline.json이 하드코딩돼 있어서
A단계 풀을 넘겨도 조용히 기준선 풀을 읽었다(2026-08-17 발견). 새 시스템의 후보가
채점 입력에서 통째로 빠지는데 실행은 성공하므로 알아채기 어렵다.

--exclude-graded를 주면 이미 채점된 항목을 빼고 **새로 판정할 것만** 남긴다.
풀을 다시 만들 때마다 전부 재채점하지 않기 위한 것이다.

실행:
  python backend/eval/build_grading_input.py --pool pool-a.json --partition dev
  python backend/eval/build_grading_input.py --pool pool-a.json --partition dev --exclude-graded
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "docs" / "atee" / "eval"
# --exclude-graded가 "이미 판정됨"으로 칠 파일 **목록**. glob로 싹 긁으면
# 폐기본과 부분 라벨까지 완료로 세어 새 입력에서 항목이 조용히 빠진다.
# 기준서 버전이 다른 채점본을 섞는 것과 같은 실수라 명시 목록으로 둔다.
GRADED_FILES = (
    "grading-codex-all.json",
    "grading-codex-a-new.json",
    "grading-codex-a2.json",
    "grading-codex-a3.json",
    "grading-codex-typo.json",
    "grading-codex-cat.json",
    "grading-codex-color.json",
    # 아래 둘은 기준서 v3(색 라벨·카테고리를 보여준다)으로 매긴 것이다.
    #
    # ⚠️ **이 함수에서는 순서가 의미 없다.** already_graded()는 itemId를 집합에
    # 넣을 뿐 등급을 읽지 않는다. "마지막 파일이 이긴다"가 성립하는 곳은
    # compute_baseline.py의 점수 계산(딕셔너리를 덮어쓴다)뿐이다.
    # 여기서 v3 파일을 넣는 이유는 그 항목들을 "이미 판정됨"으로 세기 위해서다.
    "grading-codex-color2.json",
    "grading-codex-color3.json",
    "grading-codex-range.json",   # 기준서 v3.1 (제품 범위 명시)
)

# 세지 않는 파일과 그 이유 — 지우지 말고 여기 남긴다
NOT_GRADED = {
    "grading-codex-dev.json": "기준서 v1로 매긴 폐기본 (compute_baseline.py 주석 참고)",
    "grading-codex-confirm.json": "채점자 일치도 확인용 부분 라벨",
    "grading-claude-confirm.json": "채점자 일치도 확인용 부분 라벨",
    "grading-claude-anchor.json": "기준점 확인용 부분 라벨",
}

# 계열별 규칙 요약 — 채점자가 기준서를 못 읽는 경우에도 최소 규칙은 입력에 실린다
BUCKET_RULE = {
    "G1": "브랜드 질의. 그 브랜드가 아니면 무조건 0.",
    "G2": "짧은 키워드·속성. 속성이 모두 확인되면 2, 일부만 맞으면 1.",
    "G3": "표기 변형. 원본 질의 기준으로 판정하고 변형 자체로 감점하지 않는다.",
    "G4": "문장·복합. 하드 조건(가격·성별·명시된 색)을 하나라도 어기면 0.",
    "G5": "부정 조건. 부정을 위반하면 다른 조건을 다 만족해도 0.",
    "G6": "0건이 정답 — 상품 단위로 채점하지 않는다(입력에 포함되지 않는다).",
    "R1": "참고 계열. 다른 계열과 같은 방식으로 매기되 종합 점수에서 제외된다.",
}


def already_graded() -> set[str]:
    """등급이 매겨진 itemId 집합. 형식이 다른 파일이 섞여 있어 방어적으로 읽는다."""
    done: set[str] = set()
    for name in GRADED_FILES:
        path = EVAL_DIR / name
        if not path.exists():
            raise SystemExit(f"채점본이 없습니다: {name} (GRADED_FILES를 갱신하세요)")
        doc = json.loads(path.read_text(encoding="utf-8"))
        rows = doc if isinstance(doc, list) else doc.get("items", [])
        for row in rows:
            if isinstance(row, dict) and row.get("grade") is not None:
                done.add(row["itemId"])
    return done


def build(partitions: set[str], pool_name: str, exclude_graded: bool) -> dict:
    pool_path = EVAL_DIR / pool_name
    pool = json.loads(pool_path.read_text(encoding="utf-8"))
    skip = already_graded() if exclude_graded else set()
    items: list[dict] = []

    for q in pool["queries"]:
        if q["partition"] not in partitions:
            continue
        if q["bucket"] == "G6":
            continue  # 질의 단위 지표 — 상품 판정 대상이 아니다 (기준서 §3 G6)
        for cand in q["candidates"]:
            if f"{q['id']}-{cand['goodsNo']}" in skip:
                continue
            items.append(
                {
                    # itemId는 질의·상품을 잇는 키지만 순위는 담지 않는다
                    "itemId": f"{q['id']}-{cand['goodsNo']}",
                    "queryId": q["id"],
                    "bucket": q["bucket"],
                    "rule": BUCKET_RULE.get(q["bucket"], ""),
                    "query": q["query"],
                    "origin": None,
                    "product": {
                        "title": cand["title"],
                        "brand": cand["brandName"],
                        "price": cand["priceFinal"],
                        "gender": cand["gender"],
                        # ⚠️ 아래 둘은 **판매자 라벨(정본)**이지 제목에서 읽은 것이
                        # 아니다. 검색이 이 값으로 거르고 순위를 매기므로 채점자도
                        # 봐야 한다 — 안 보여 주면 색 라벨이 검정인 상품이 제목에
                        # '검정'이 없다는 이유로 "확인 불가(1)"가 된다.
                        "colorLabel": cand.get("colorLabel"),
                        "category": cand.get("category"),
                    },
                }
            )

    # G3은 원본 질의를 알려줘야 판정이 가능하다 (기준서 §3 G3)
    qset = json.loads((EVAL_DIR / "query-set.json").read_text(encoding="utf-8"))
    origin_of = {e["id"]: e.get("origin") for e in qset["entries"]}
    for it in items:
        it["origin"] = origin_of.get(it["queryId"])
        if it["origin"] is None:
            del it["origin"]

    # 전역 셔플 — 해시 정렬이라 실행마다 같은 순서(재현 가능)
    items.sort(key=lambda i: hashlib.sha256(i["itemId"].encode()).hexdigest())

    return {
        "meta": {
            "purpose": "블라인드 채점 입력. 시스템·순위 정보를 담지 않고 순서를 섞었다.",
            "rubric": "docs/atee/eval/rubric.md — 이 문서를 읽고 채점한다",
            "partitions": sorted(partitions),
            "pool": pool_name,
            "excludeGraded": exclude_graded,
            "gradedFiles": list(GRADED_FILES) if exclude_graded else [],
            "count": len(items),
            "gradeScale": {
                "2": "질의가 명시한 조건을 전부 만족",
                "1": "일부만 만족하거나 근접, 또는 텍스트로 확인 불가",
                "0": "무관, 또는 계열 규칙 위반(브랜드 불일치·하드조건 위반·부정조건 위반)",
            },
            "needsImage": "이미지를 봐야 판단되면 true로 표시하고 등급은 1을 준다",
            "colorLabel": (
                "판매자가 등록한 색 라벨(정본). 제목에 색이 안 적혀 있어도 이 값이 "
                "질의의 색과 맞으면 색 조건은 **확인된 것**으로 본다"
            ),
            "category": (
                "무신사 카테고리 정본. 001001 반팔 티셔츠 · 001003 피케·카라 · "
                "001004 후드·맨투맨 · 001010 긴팔 · 001011 민소매"
            ),
            "outputFormat": '[{"itemId": "...", "grade": 0|1|2, "needsImage": true|false}]',
        },
        "items": items,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--partition", required=True, help="dev 또는 progress,holdout")
    # 기본값을 두지 않는다. 예전엔 pool-baseline.json이 기본이라, A 풀을
    # 의도한 호출에서 인자를 빠뜨려도 성공하며 엉뚱한 풀을 읽었다.
    parser.add_argument("--pool", required=True, help="docs/atee/eval 아래 풀 파일명")
    parser.add_argument(
        "--exclude-graded",
        action="store_true",
        help="이미 채점된 항목을 빼고 새 후보만 남긴다",
    )
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    partitions = {p.strip() for p in args.partition.split(",")}
    doc = build(partitions, args.pool, args.exclude_graded)
    # 기본 출력명에 풀 이름을 넣는다 — 안 넣으면 baseline 입력과 A 입력이
    # 같은 파일명을 두고 서로 덮어쓴다
    pool_tag = args.pool.removeprefix("pool-").removesuffix(".json")
    name = args.out or f"grading-input-{pool_tag}-{'-'.join(sorted(partitions))}.json"
    out = EVAL_DIR / name
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"생성: {out.relative_to(ROOT)} — {doc['meta']['count']}개 항목")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
