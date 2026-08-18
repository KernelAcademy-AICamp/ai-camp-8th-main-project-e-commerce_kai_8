from ingest.brands import build_matcher, resolve_brand

ENTRIES = [
    {"canonical": "코오롱스포츠", "aliases": ["코오롱스포츠", "코오롱 스포츠", "코오롱", "KOLON", "KS", "코오롱인더스트리"]},
    {"canonical": "온사이트", "aliases": ["온사이트", "ONSIGHT", "onsight"]},
    {"canonical": "포텐셜", "aliases": ["포텐셜"]},
    {"canonical": "레몬클라임비터", "aliases": ["레몬클라임비터", "레클비"]},
]
M = build_matcher(ENTRIES)


def test_matches_from_brand_field():
    assert resolve_brand("아무 제목", "온사이트", None, None, M) == "온사이트"


def test_unknown_and_empty_brand_ignored_falls_back_to_title():
    assert resolve_brand("포텐셜 클라이밍 반팔티", "UNKNOWN", "", None, M) == "포텐셜"


def test_oem_alias_maps_to_brand():
    assert resolve_brand("무제", None, "코오롱인더스트리", None, M) == "코오롱스포츠"


def test_english_alias_case_insensitive():
    assert resolve_brand("ONSIGHT climbing tee", None, None, None, M) == "온사이트"


def test_longest_alias_wins():
    assert resolve_brand("코오롱스포츠 볼더링 티", None, None, None, M) == "코오롱스포츠"


def test_strips_bracket_and_mall_prefix():
    assert resolve_brand("[매장발송]코오롱스포츠 반팔", None, None, None, M) == "코오롱스포츠"
    assert resolve_brand("하프클럽/코오롱 볼더링 티", None, None, None, M) == "코오롱스포츠"


def test_priority_brand_over_title():
    assert resolve_brand("온사이트 클라이밍 티", "포텐셜", None, None, M) == "포텐셜"


def test_matches_from_mall_name():
    # brand/maker 없고 제목에도 브랜드명이 없지만 자사몰명이 브랜드(레몬클라임비터·약칭)
    assert resolve_brand("클라이밍 티셔츠 리치이슈", None, None, "레몬클라임비터", M) == "레몬클라임비터"


def test_mall_name_alias_abbreviation_in_title():
    # 제목에 약칭(레클비)만 있어도 매칭
    assert resolve_brand("2026 리뉴얼 레클비 클라이밍 반팔티", None, None, None, M) == "레몬클라임비터"


def test_no_match_returns_none():
    assert resolve_brand("이름없는 볼더링 반팔티", None, None, "11번가", M) is None
