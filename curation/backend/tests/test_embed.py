from ingest.embed import build_embed_text, embed_texts


def test_build_embed_text_joins_title_and_categories():
    row = {
        "title": "포텐셜 클라이밍 티셔츠 홀로그램 곰 암장 볼더링",
        "category2": "등산",
        "category3": "등산의류",
        "category4": "반팔티셔츠",
    }
    text = build_embed_text(row)
    assert "홀로그램 곰" in text
    assert "등산의류" in text
    assert text == text.strip()


def test_build_embed_text_ignores_missing_fields():
    text = build_embed_text({"title": "무지 반팔"})
    assert text == "무지 반팔"


def test_embed_texts_maps_response_to_vectors(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")

    def fake_post(url, headers=None, json=None, timeout=None):
        assert json["input_type"] == "passage"
        assert json["input"] == ["a", "b"]

        class R:
            status_code = 200

            @staticmethod
            def raise_for_status():
                return None

            @staticmethod
            def json():
                return {"data": [{"index": 0, "embedding": [0.1, 0.2]},
                                  {"index": 1, "embedding": [0.3, 0.4]}]}

        return R()

    vecs = embed_texts(["a", "b"], http_post=fake_post)
    assert vecs == [[0.1, 0.2], [0.3, 0.4]]


def test_embed_texts_orders_by_index(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")

    def fake_post(url, headers=None, json=None, timeout=None):
        class R:
            status_code = 200

            @staticmethod
            def raise_for_status():
                return None

            @staticmethod
            def json():
                # 응답이 뒤섞여 와도 index로 정렬해야 입력 순서와 일치
                return {"data": [{"index": 1, "embedding": [0.3]},
                                 {"index": 0, "embedding": [0.1]}]}

        return R()

    assert embed_texts(["a", "b"], http_post=fake_post) == [[0.1], [0.3]]
