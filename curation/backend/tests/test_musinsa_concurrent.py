"""동시 상세 fetch 테스트. FakeMC로 API 미호출."""
from musinsa.concurrent_ingest import fetch_one, fetch_payloads, write_batch


class FakeMC:
    def __init__(self, fail_on=()):
        self.fail_on = set(fail_on)

    def product_detail(self, no):
        if no in self.fail_on:
            raise RuntimeError("boom")
        return {
            "baseCategoryFullPath": "c",
            "styleNo": f"ST{no}",
            "season": "2",
            "goodsImages": [{"imageUrl": "/images/prd_img/a.jpg"}],
        }

    def actual_size(self, no):
        return {"sizes": [{"name": "M", "items": []}]}


def _item(no):
    return {
        "goodsNo": no,
        "goodsName": f"티셔츠 {no} (BLACK)",
        "goodsLinkUrl": "u",
        "brand": "b",
        "brandName": "브",
    }


def test_fetch_one_builds_payload():
    p = fetch_one(FakeMC(), _item(10))
    assert p["product"]["goods_no"] == 10
    assert p["product"]["size_measures"] == {"sizes": [{"name": "M", "items": []}]}
    assert "style:ST10" in p["design"]["design_key"]
    assert len(p["images"]) == 1


def test_fetch_payloads_concurrent_filters_failures():
    items = [_item(n) for n in (1, 2, 3, 4)]
    out = fetch_payloads(FakeMC(fail_on={2}), items, workers=3)
    got = sorted(p["product"]["goods_no"] for p in out)
    assert got == [1, 3, 4]  # 2는 실패로 제외


class FakeTable:
    def __init__(self, store, name):
        self.store, self.name = store, name
        self._sel = None
        self._in = None

    def upsert(self, rows, on_conflict=None):
        self.store.setdefault(self.name, []).extend(rows)
        return self

    def select(self, *a, **k):
        self._sel = True
        return self

    def in_(self, col, vals):
        self._in = (col, set(vals))
        return self

    def execute(self):
        if self._sel:  # id 조회: 저장된 행에 가짜 id 부여해 반환
            col, vals = self._in
            data = [
                {
                    **r,
                    "id": f"{self.name}-{r.get('design_key') or r.get('musinsa_brand')}",
                }
                for r in self.store.get(self.name, [])
                if r.get(col) in vals
            ]
            return type("R", (), {"data": data})
        return type("R", (), {"data": []})


class FakeClient:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return FakeTable(self.store, name)


def _payload(no, brand_slug="b", dkey="b::style:S1"):
    return {
        "brand": {
            "musinsa_brand": brand_slug,
            "brand_name": "브",
        },
        "design": {
            "design_key": dkey,
            "title": "t",
            "brand_id": None,
            "category_full": "c",
            "style_no": "S1",
            "searchable": True,
            "exclusion_reason": None,
        },
        "product": {"goods_no": no, "goods_name": "t", "color": "BLACK"},
        "images": [{"goods_no": no, "url": f"u{no}", "ord": 0}],
    }


def test_write_batch_resolves_ids_and_counts():
    c = FakeClient()
    n = write_batch(c, [_payload(1), _payload(2)])  # 같은 design_key → 디자인 1개로 묶임
    assert n == 2
    prods = c.store["m_products"]
    assert all(p["design_id"] == "m_designs-b::style:S1" for p in prods)
    assert all(p["design_id"] and "None" not in str(p["design_id"]) for p in prods)
    assert len(c.store["m_images"]) == 2
