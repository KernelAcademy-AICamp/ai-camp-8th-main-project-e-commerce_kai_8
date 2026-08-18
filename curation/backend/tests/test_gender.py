from ingest.gender import classify_gender


def test_male_keyword():
    assert classify_gender("K2 남성 기본 카라티셔츠 클라이밍") == "male"


def test_female_keyword():
    assert classify_gender("와일 무등산 우먼 클라이밍 티셔츠 블랙") == "female"


def test_unisex_keyword():
    assert classify_gender("뀨티 반팔 클라이밍 티셔츠 남녀공용 9gu") == "unisex"


def test_both_male_and_female_is_unisex():
    # '남성 여성'처럼 두 신호가 함께면 공용으로 흡수
    assert classify_gender("네파 남성 여성 반팔티셔츠 여름 클라이밍") == "unisex"
    assert classify_gender("네파 반팔티셔츠 2팩 남자 여자 클라이밍") == "unisex"


def test_no_signal_defaults_unisex():
    assert classify_gender("온사이트 후지산 클라이밍 티셔츠") == "unisex"


def test_empty_title_defaults_unisex():
    assert classify_gender("") == "unisex"


def test_maninmaan_not_matched_as_male():
    # '맨투맨'의 '맨'이 남성으로 오탐되면 안 됨(맨즈/맨스만 매칭)
    assert classify_gender("클라이밍 맨투맨 오버핏 반팔") == "unisex"


def test_english_case_insensitive():
    assert classify_gender("CLIMBING WOMEN Tee") == "female"
