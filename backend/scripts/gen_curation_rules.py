"""FOR YOU 개인화가 쓸 키워드 규칙만 뽑아낸다 (계획 2026-08-20-foryou-curation-personalization 3단계).

`curations.rules`의 제목 키워드(`kw`·`kw_title`)와 제외어(`not_kw`)만 작은 파일로 옮긴다.
기기가 "내가 찜한 상품 제목이 어느 큐레이션에 걸리나"를 서버 없이 판정하는 재료다.

**curations.json은 건드리지 않는다.** 그 파일에는 사람이 쓴 슬라이드 제목 488장이
들어 있는데 gen_curation_page.py는 그것을 만들지 못한다 — 같이 쓰면 지워진다.

색·리뷰수·치수 조건은 옮기지 않는다. 기기에 그 정보가 없어서다. 그래서 기기 판정은
실제 큐레이션보다 **조금 넓게** 걸린다(예: "리뷰 30개 이상" 조건이 빠진다).
고르는 데 쓸 뿐 큐레이션 내용은 그대로라 넓은 쪽이 안전하다.

실행 (backend 디렉터리에서):
    .venv/bin/python scripts/gen_curation_rules.py
"""
import json
from pathlib import Path

from gen_curation_page import connect, load

OUT = Path(__file__).resolve().parents[2] / "frontend/features/curation/data/curation-rules.json"


def keywords(rules):
    """제목으로 판정 가능한 부분만 남긴다. kw는 제목 또는 태그지만 기기엔 제목뿐이다."""
    kw = [*rules.get("kw", []), *rules.get("kw_title", [])]
    return {"kw": kw, "not": rules.get("not_kw", [])} if kw else None


def main():
    with connect() as conn, conn.cursor() as cur:
        rows = load(cur)
    out = {}
    for r in rows:
        rule = keywords(r["rules"])
        if rule:
            out[r["key"]] = rule
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    skipped = [r["key"] for r in rows if keywords(r["rules"]) is None]
    print(f"{len(out)}/{len(rows)}건 → {OUT}")
    if skipped:
        print("제목 키워드가 없어 뺀 큐레이션:", ", ".join(skipped))


if __name__ == "__main__":
    main()
