"""정규화 엔트리포인트 테스트. 실제 DB 미접속."""
from run_musinsa_normalize import load_facets, run


class FakeClient:
    def __init__(self, goods, facets):
        self.goods, self.facets, self.updated = goods, facets, []

    def table(self, name):
        outer = self

        class T:
            def __init__(self):
                self._sel = None; self._eq = None; self._range = None
            def select(self, sel, *a, **k):
                self._sel = sel; return self
            def eq(self, col, val):
                self._eq = (col, val); return self
            def order(self, *a, **k):
                return self
            def range(self, lo, hi):
                self._range = (lo, hi); return self
            def upsert(self, rows, on_conflict=None):
                outer.updated.extend(rows); return self
            def execute(self):
                data = outer.goods if name == "m_raw_goods" else outer.facets
                if self._range is not None:
                    lo, hi = self._range; data = data[lo:hi + 1]
                return type("R", (), {"data": data})
        return T()


def _goods(n):
    return {"goods_no": n, "plp": {"displayGenderText": "남성"},
            "detail": {"goodsNm": f"티셔츠 {n} (BLACK)", "styleNo": f"S{n}",
                       "brandInfo": {"brand": "b", "brandName": "브"},
                       "goodsImages": [{"imageUrl": "/a.jpg"}, {"imageUrl": "/b.jpg"}]},
            "actual_size": {"sizes": [{"name": "M"}]}}


def test_load_facets_groups_by_goods_no():
    c = FakeClient([], [{"goods_no": 1, "parameter_key": "color", "display_text": "블랙"},
                        {"goods_no": 1, "parameter_key": "attributeMaterial", "display_text": "면"},
                        {"goods_no": 2, "parameter_key": "color", "display_text": "화이트"}])
    fac = load_facets(c, "t")
    assert len(fac[1]) == 2 and len(fac[2]) == 1


def test_run_derives_and_updates():
    c = FakeClient([_goods(1), _goods(2)],
                   [{"goods_no": 1, "parameter_key": "attributeMaterial", "display_text": "면"}])
    stats = run(c, ingest_tag="sports_patterned_v1", batch=100)
    assert stats["processed"] == 2
    assert stats["searchable"] == 2
    by_no = {r["goods_no"]: r for r in c.updated}
    assert by_no[1]["materials"] == ["면"]
    assert by_no[1]["title"] == "티셔츠 1"
    assert by_no[1]["sizes"] == ["M"]
    assert all(r.get("normalized_at") for r in c.updated)


def test_run_counts_bundles():
    g = _goods(3); g["detail"]["goodsNm"] = "반팔티 3종"; g["detail"]["goodsImages"] = []
    c = FakeClient([g], [])
    stats = run(c, ingest_tag="sports_patterned_v1")
    assert stats["bundles"] == 1 and stats["searchable"] == 0
