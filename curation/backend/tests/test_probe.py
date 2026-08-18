from ingest.probe import summarize


def test_summarize_contains_query_and_titles():
    items = [
        {"title": "야마 볼더링 오버핏 <b>티셔츠</b>", "brand": "야마", "lprice": "14800"},
        {"title": "세이즈믹 크랙 티셔츠", "brand": "세이즈믹", "lprice": "49000"},
    ]
    out = summarize("볼더링 티셔츠", items, top=5)
    assert "볼더링 티셔츠" in out
    assert "야마 볼더링 오버핏 티셔츠" in out  # <b> 제거 확인
    assert "세이즈믹" in out


def test_summarize_handles_empty():
    out = summarize("없는키워드", [])
    assert "0" in out
