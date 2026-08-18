from backfill_embeddings import backfill_embeddings


class FakeBuilder:
    """supabase-py 빌더 흉내. select→is_→limit→execute(조회)와
    update→eq→execute(갱신) 두 체인을 지원하고, update는 실제로 행을 mutate한다."""

    def __init__(self, store):
        self._store = store
        self._payload = None
        self._eq_id = None
        self._filter_null = False

    def select(self, *a, **k):
        return self

    def update(self, payload):
        self._payload = payload
        return self

    def is_(self, col, val):
        self._filter_null = True
        return self

    def eq(self, col, val):
        self._eq_id = val
        return self

    def limit(self, n):
        return self

    def execute(self):
        if self._payload is not None:  # update 경로: 매칭 행 mutate + 기록
            for row in self._store["rows"]:
                if row["id"] == self._eq_id:
                    row.update(self._payload)
            self._store["updates"].append((self._eq_id, self._payload))
            return type("R", (), {"data": [], "count": 0})
        rows = self._store["rows"]  # select 경로
        if self._filter_null:
            rows = [r for r in rows if r.get("embedding") is None]
        return type("R", (), {"data": rows, "count": len(rows)})


class FakeClient:
    def __init__(self, rows):
        self._store = {"rows": rows, "updates": []}

    def table(self, name):
        return FakeBuilder(self._store)

    @property
    def updates(self):
        return self._store["updates"]


def test_backfill_only_null_rows_and_writes_vectors():
    client = FakeClient([
        {"id": "1", "title": "홀로그램 곰 티", "embedding": None},
        {"id": "2", "title": "이미 있음", "embedding": [0.9]},
    ])

    def fake_embed(texts, input_type="passage"):
        return [[0.1, 0.2] for _ in texts]

    n = backfill_embeddings(client, embed_fn=fake_embed)
    assert n == 1
    updates = client.updates
    assert len(updates) == 1
    assert updates[0][0] == "1"
    assert updates[0][1]["embedding"] == [0.1, 0.2]


def test_backfill_terminates_across_batches():
    """batch보다 많은 null 행도 update가 행을 채워 IS NULL이 줄어들며 종료한다."""
    rows = [{"id": str(i), "title": f"t{i}", "embedding": None} for i in range(5)]
    client = FakeClient(rows)

    def fake_embed(texts, input_type="passage"):
        return [[0.1] for _ in texts]

    n = backfill_embeddings(client, embed_fn=fake_embed, batch=2)
    assert n == 5
    assert all(r["embedding"] == [0.1] for r in rows)
