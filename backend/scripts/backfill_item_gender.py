"""큐레이션에 실린 상품에 성별을 채워 넣는다 (계획 2026-08-21-curation-gender-filter 1단계).

`curations.json`을 다시 뽑지 않고 `g`(성별) 필드만 덧붙인다. 다시 뽑으면 사람이 쓴
슬라이드 제목 488장이 지워지기 때문이다 (gen_curation_rules.py와 같은 사정).

상품 번호는 판매처 URL에만 있어서 거기서 뽑아 쓴다. 카탈로그에 없거나 성별이 빈
상품은 `g`를 안 붙인다 — 읽는 쪽에서 미상으로 다루고 거르지 않는다.

앞으로 `gen_curation_page.py`를 다시 돌리면 성별이 처음부터 실린다(CARD_COLS 포함).
이 스크립트는 이미 실려 있는 것을 뒤늦게 채우는 용도다.

실행 (backend 디렉터리에서):
    .venv/bin/python scripts/backfill_item_gender.py
"""
import json
import re

from gen_curation_page import JSON_OUTS, connect

PATH = JSON_OUTS[0]


def main():
    curations = json.loads(PATH.read_text(encoding="utf-8"))
    items = [i for c in curations for i in c["items"]]
    nos = {}
    for item in items:
        m = re.search(r"/products/(\d+)", item["u"])
        if m:
            nos[item["u"]] = int(m.group(1))

    with connect() as conn, conn.cursor() as cur:
        cur.execute("select goods_no, gender from c_goods where goods_no = any(%s)",
                    (sorted(set(nos.values())),))
        gender = {no: g for no, g in cur.fetchall() if g}

    filled = 0
    for item in items:
        g = gender.get(nos.get(item["u"], -1))
        if g:
            item["g"] = g
            filled += 1
        else:
            item.pop("g", None)

    PATH.write_text(json.dumps(curations, ensure_ascii=False, indent=1) + "\n",
                    encoding="utf-8")
    counts = {}
    for item in items:
        counts[item.get("g", "(미상)")] = counts.get(item.get("g", "(미상)"), 0) + 1
    print(f"{filled}/{len(items)}장에 성별을 채웠다: {counts}")
    print(f"→ {PATH} ({PATH.stat().st_size:,}바이트)")


if __name__ == "__main__":
    main()
