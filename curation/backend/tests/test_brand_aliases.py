import json
from pathlib import Path

from musinsa.brand_aliases import (
    build_alias_rows,
    is_safe_alias,
    normalize_brand_key,
    stale_brands,
)

VECTORS = json.loads(
    (Path(__file__).resolve().parents[2]
     / "client/features/search/domain/normalize-brand.vectors.json").read_text()
)


def test_normalize_matches_shared_vectors():
    for v in VECTORS:
        assert normalize_brand_key(v["input"]) == v["key"], v["input"]


def test_safe_rules_length():
    counts = {"나": 1, "무신사스탠다드": 1, "ab": 1, "abc": 1, "티셔츠": 1}
    assert is_safe_alias("나", counts) is False          # 한 글자 한글
    assert is_safe_alias("ab", counts) is False          # 1–2자 영문
    assert is_safe_alias("abc", counts) is True          # 3자 영문 OK
    assert is_safe_alias("무신사스탠다드", counts) is True
    assert is_safe_alias("티셔츠", counts) is False      # 일반명사 스톱워드


def test_safe_rules_conflict():
    counts = {"nike": 2}  # 두 브랜드가 같은 키 → unsafe
    assert is_safe_alias("nike", counts) is False


def test_build_alias_rows_promotes_by_rule():
    rows = build_alias_rows(["무신사 스탠다드", "나", "COVERNAT"])
    by_key = {r["alias_normalized"]: r for r in rows}
    assert by_key["무신사스탠다드"]["catalog_brand"] == "무신사 스탠다드"
    assert by_key["무신사스탠다드"]["hard_filter_safe"] is True
    assert by_key["나"]["hard_filter_safe"] is False
    assert by_key["covernat"]["hard_filter_safe"] is True


def test_build_alias_rows_conflict_both_unsafe():
    # 정규화 후 같은 키가 되는 서로 다른 브랜드 → 둘 다 unsafe
    rows = build_alias_rows(["draw fit", "DRAW-FIT세컨드"])  # 키 다름 → 충돌 아님(대조군)
    rows2 = build_alias_rows(["draw fit", "DRAWFIT"])        # 키 동일 → 충돌
    keys2 = [r for r in rows2 if r["alias_normalized"] == "drawfit"]
    assert len(keys2) == 2 and all(r["hard_filter_safe"] is False for r in keys2)
    assert any(r["hard_filter_safe"] for r in rows)


def test_stale_brands_returns_existing_minus_current():
    existing = {"나이키", "구브랜드", "커버낫"}
    current = {"나이키", "커버낫", "신규브랜드"}
    assert stale_brands(existing, current) == {"구브랜드"}


def test_stale_brands_empty_when_no_removed():
    existing = {"나이키", "커버낫"}
    current = {"나이키", "커버낫", "신규브랜드"}
    assert stale_brands(existing, current) == set()
