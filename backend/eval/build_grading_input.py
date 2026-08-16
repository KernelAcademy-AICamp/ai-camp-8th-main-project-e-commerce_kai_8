"""채점 입력 생성 — 블라인드·순서 무작위 (계획 5·6단계, 기준서 §6).

채점자에게 주지 않는 것: 어느 시스템이 냈는지, 몇 등이었는지, 질의 의도 설명.
순서를 섞는 이유: 랭킹된 목록을 그대로 보여주면 앞쪽을 후하게 매긴다.
같은 질의의 항목이 붙어 있지 않게 전역으로 섞는다.

지표는 채점이 끝난 뒤 실제 순위와 대조해 계산한다(compute_baseline.py).

실행:
  python backend/eval/build_grading_input.py --partition dev
  python backend/eval/build_grading_input.py --partition progress,holdout
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL_DIR = ROOT / "docs" / "atee" / "eval"
POOL_PATH = EVAL_DIR / "pool-baseline.json"

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


def build(partitions: set[str]) -> dict:
    pool = json.loads(POOL_PATH.read_text(encoding="utf-8"))
    items: list[dict] = []

    for q in pool["queries"]:
        if q["partition"] not in partitions:
            continue
        if q["bucket"] == "G6":
            continue  # 질의 단위 지표 — 상품 판정 대상이 아니다 (기준서 §3 G6)
        for cand in q["candidates"]:
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
            "count": len(items),
            "gradeScale": {
                "2": "질의가 명시한 조건을 전부 만족",
                "1": "일부만 만족하거나 근접, 또는 텍스트로 확인 불가",
                "0": "무관, 또는 계열 규칙 위반(브랜드 불일치·하드조건 위반·부정조건 위반)",
            },
            "needsImage": "이미지를 봐야 판단되면 true로 표시하고 등급은 1을 준다",
            "outputFormat": '[{"itemId": "...", "grade": 0|1|2, "needsImage": true|false}]',
        },
        "items": items,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--partition", required=True, help="dev 또는 progress,holdout")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    partitions = {p.strip() for p in args.partition.split(",")}
    doc = build(partitions)
    name = args.out or f"grading-input-{'-'.join(sorted(partitions))}.json"
    out = EVAL_DIR / name
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"생성: {out.relative_to(ROOT)} — {doc['meta']['count']}개 항목")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
