"""raw fetch 테스트. FakeMC로 API 미호출."""
from musinsa.raw_landing import fetch_goods_raw, fetch_raw_batch


class FakeMC:
    def __init__(self, fail=()):
        self.fail = set(fail)  # {(source, no), ...}

    def detail_json(self, no):
        if ("detail", no) in self.fail:
            raise RuntimeError("boom")
        return {"meta": {"result": "SUCCESS"}, "data": {"goodsNo": no, "styleNo": f"S{no}"}}

    def actual_size_json(self, no):
        if ("actual_size", no) in self.fail:
            raise RuntimeError("boom")
        return {"meta": {"result": "SUCCESS"}, "data": {"sizes": []}}

    def options_json(self, no):
        if ("options", no) in self.fail:
            raise RuntimeError("boom")
        return {"meta": {"result": "SUCCESS"}, "data": {"basic": []}}


def _item(no):
    return {"goodsNo": no, "goodsName": f"티셔츠 {no}"}


def test_fetch_goods_raw_stores_data_untouched():
    r = fetch_goods_raw(FakeMC(), _item(5))
    assert r["goods_no"] == 5
    assert r["plp"] == _item(5)                       # plp 카드 원본 그대로
    assert r["detail"] == {"goodsNo": 5, "styleNo": "S5"}  # .data만 언랩, 필드 가공 없음
    assert r["actual_size"] == {"sizes": []}
    assert r["options"] == {"basic": []}
    assert r["source_status"] == {"detail": "ok", "actual_size": "ok", "options": "ok"}


def test_fetch_goods_raw_partial_failure_sets_null_and_status():
    r = fetch_goods_raw(FakeMC(fail={("options", 5)}), _item(5))
    assert r["detail"] is not None
    assert r["options"] is None
    assert r["source_status"]["options"].startswith("error")
    assert r["source_status"]["detail"] == "ok"


def test_fetch_raw_batch_keeps_all_items():
    out = fetch_raw_batch(FakeMC(), [_item(1), _item(2), _item(3)], workers=3)
    assert sorted(r["goods_no"] for r in out) == [1, 2, 3]


def test_fetch_raw_batch_skips_items_without_goodsno():
    out = fetch_raw_batch(FakeMC(), [{"goodsName": "x"}, _item(9)], workers=2)
    assert [r["goods_no"] for r in out] == [9]
