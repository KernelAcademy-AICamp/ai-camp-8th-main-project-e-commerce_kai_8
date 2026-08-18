"""facet 엔트리포인트 테스트. 실제 API/DB 미접속."""
from run_musinsa_facets import load_goods, run


class FakeMC:
    def filter_facets(self, category):
        return {"detail": {
            "attributeMaterial": {"list": [{"displayText": "면", "value": "1^3"}]},
            "color": {"list": [{"value": "WHITE"}]},
            "attributePattern": {"list": []},
            "attributeFit": {"list": []},
            "style": {"list": []},
        }}

    PAGES = {("attributeMaterial", "1^3"): [[1, 2, 9]], ("color", "WHITE"): [[2, 8]]}

    def list_page(self, category, page, size=100, extra=None):
        pk = next(k for k in extra if k != "separatorId")
        lst = self.PAGES[(pk, extra[pk])][page - 1]
        return {"list": [{"goodsNo": g} for g in lst], "pagination": {"hasNext": False}}


class FakeClient:
    def __init__(self, goods):
        self.goods = goods
        self.store = {}

    def table(self, name):
        store, goods = self.store, self.goods

        class T:
            def __init__(self):
                self._range = None
            def select(self, *a, **k):
                return self
            def eq(self, *a, **k):
                return self
            def range(self, lo, hi):
                self._range = (lo, hi)
                return self
            def upsert(self, rows, on_conflict=None):
                store.setdefault(name, []).extend(rows)
                return self
            def execute(self):
                if self._range is not None:
                    lo, hi = self._range
                    page = [{"goods_no": g} for g in goods][lo:hi + 1]
                    return type("R", (), {"data": page})
                return type("R", (), {"data": []})
        return T()


def test_load_goods_reads_all():
    c = FakeClient([1, 2, 9])
    assert load_goods(c, "sports_patterned_v1") == {1, 2, 9}


def test_run_tags_only_our_goods():
    c = FakeClient([1, 2, 9])           # 8은 우리 set 밖
    stats = run(c, FakeMC(), ingest_tag="sports_patterned_v1")
    rows = c.store["m_raw_facets"]
    got = {(r["goods_no"], r["parameter_key"], r["value"]) for r in rows}
    assert got == {(1, "attributeMaterial", "1^3"), (2, "attributeMaterial", "1^3"),
                   (9, "attributeMaterial", "1^3"), (2, "color", "WHITE")}
    assert all(r["ingest_tag"] == "sports_patterned_v1" for r in rows)
    assert stats["memberships"] == 4
    assert stats["goods_covered"] == 3


def test_run_groups_filter_limits_scope():
    c = FakeClient([1, 2, 9])
    stats = run(c, FakeMC(), ingest_tag="sports_patterned_v1", groups=["attributeMaterial"])
    pks = {r["parameter_key"] for r in c.store["m_raw_facets"]}
    assert pks == {"attributeMaterial"}   # color 제외됨


def test_run_workers_param_behavior_preserving():
    # workers=1(순차와 동등) vs 기본 workers(스레드풀 동시성)가 동일한 멤버십/stats를 내야 함
    c1 = FakeClient([1, 2, 9])
    stats1 = run(c1, FakeMC(), ingest_tag="sports_patterned_v1", workers=1)
    got1 = {(r["goods_no"], r["parameter_key"], r["value"]) for r in c1.store["m_raw_facets"]}

    c4 = FakeClient([1, 2, 9])
    stats4 = run(c4, FakeMC(), ingest_tag="sports_patterned_v1", workers=4)
    got4 = {(r["goods_no"], r["parameter_key"], r["value"]) for r in c4.store["m_raw_facets"]}

    assert got1 == got4
    assert stats1 == stats4
