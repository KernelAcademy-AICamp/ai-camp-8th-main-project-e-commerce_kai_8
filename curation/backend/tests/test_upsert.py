from db.upsert import upsert_products


class FakeExec:
    def execute(self):
        return None


class FakeTable:
    def __init__(self, log):
        self._log = log

    def upsert(self, rows, on_conflict=None):
        self._log.append({"rows": list(rows), "on_conflict": on_conflict})
        return FakeExec()


class FakeClient:
    def __init__(self):
        self.calls = []
        self.table_names = []

    def table(self, name):
        self.table_names.append(name)
        return FakeTable(self.calls)


def test_upsert_returns_count_and_uses_conflict_key():
    client = FakeClient()
    rows = [{"source": "naver_shopping", "source_product_id": str(i)} for i in range(5)]

    n = upsert_products(client, rows, chunk_size=2)

    assert n == 5
    assert client.table_names[0] == "products"
    assert [c["on_conflict"] for c in client.calls] == [
        "source,source_product_id,variant"
    ] * 3
    # 청크: 2 + 2 + 1
    assert [len(c["rows"]) for c in client.calls] == [2, 2, 1]


def test_upsert_empty_is_noop():
    client = FakeClient()
    assert upsert_products(client, []) == 0
    assert client.calls == []


def test_upsert_dedupes_duplicate_conflict_keys_in_batch():
    # 같은 (source, source_product_id)가 배치에 두 번 들어오면 하나로 접어야 한다
    # (Postgres ON CONFLICT는 한 명령에서 같은 행을 두 번 갱신 못 함 → 21000).
    client = FakeClient()
    rows = [
        {"source": "naver_shopping", "source_product_id": "1", "lprice": 100},
        {"source": "naver_shopping", "source_product_id": "1", "lprice": 200},
        {"source": "naver_shopping", "source_product_id": "2", "lprice": 300},
    ]

    n = upsert_products(client, rows)

    assert n == 2  # id 1 중복 접힘 → 2건
    sent = client.calls[0]["rows"]
    assert len(sent) == 2
    # 마지막 항목 유지
    by_id = {r["source_product_id"]: r for r in sent}
    assert by_id["1"]["lprice"] == 200


def test_upsert_keeps_distinct_variants():
    # 같은 상품이라도 variant가 다르면 별개 행 — 접으면 안 된다.
    # variant 없는 행은 DB default 1과 같으므로 variant=1 행과는 접힌다.
    client = FakeClient()
    rows = [
        {"source": "naver_shopping", "source_product_id": "1", "variant": 1, "lprice": 100},
        {"source": "naver_shopping", "source_product_id": "1", "variant": 2, "lprice": 200},
        {"source": "naver_shopping", "source_product_id": "1", "lprice": 300},  # ≡ variant 1
    ]

    assert upsert_products(client, rows) == 2
    sent = client.calls[0]["rows"]
    by_variant = {r.get("variant", 1): r for r in sent}
    assert set(by_variant) == {1, 2}
    assert by_variant[1]["lprice"] == 300  # variant 없는 행이 variant=1 행 대체(last-wins)
    assert by_variant[2]["lprice"] == 200
