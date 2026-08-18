from run_ingest import run

SAMPLE_OK = {
    "title": "야마 볼더링 <b>티셔츠</b>",
    "link": "https://smartstore.naver.com/main/products/1",
    "image": "https://x/i.jpg",
    "lprice": "14800",
    "hprice": "",
    "mallName": "야마",
    "productId": "1",
    "productType": "2",
    "brand": "야마",
    "maker": "야마",
    "category1": "스포츠/레저",
    "category2": "등산",
    "category3": "등산의류",
    "category4": "반팔티셔츠",
}
SAMPLE_FILTERED = {**SAMPLE_OK, "productId": "2", "productType": "4"}  # 중고 → 걸러짐


class FakeNaver:
    def __init__(self, mapping):
        self._mapping = mapping

    def search(self, query, **kwargs):
        return self._mapping.get(query, [])


def test_run_collects_normalizes_and_upserts():
    naver = FakeNaver({"볼더링 티셔츠": [SAMPLE_OK, SAMPLE_FILTERED]})
    captured = []

    def fake_upsert(rows):
        captured.extend(rows)
        return len(rows)

    stats = run(naver, ["볼더링 티셔츠"], fake_upsert)

    assert stats["collected"] == 2
    assert stats["kept"] == 1  # 중고 1건 필터됨
    assert stats["upserted"] == 1
    assert captured[0]["source_product_id"] == "1"
    assert captured[0]["title"] == "야마 볼더링 티셔츠"


def test_run_multiple_keywords():
    naver = FakeNaver(
        {"a": [SAMPLE_OK], "b": [{**SAMPLE_OK, "productId": "9"}]}
    )
    stats = run(naver, ["a", "b"], lambda rows: len(rows))
    assert stats["kept"] == 2
    assert stats["upserted"] == 2


def test_run_isolates_keyword_failure():
    class ExplodingNaver:
        def search(self, query, **kwargs):
            if query == "bad":
                raise RuntimeError("boom")
            return [SAMPLE_OK]

    stats = run(ExplodingNaver(), ["bad", "good"], lambda rows: len(rows))
    assert stats["kept"] == 1  # 실패한 'bad'는 건너뛰고 'good'는 계속 진행
    assert stats["upserted"] == 1
