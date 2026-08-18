"""브랜드 사전 정규화·safe 승격 규칙(순수). TS 매처와 동일 정규화 — 공통 벡터로 검증.
정규화: NFKC → lower → 공백/하이픈/언더스코어 제거."""
import re
import unicodedata

_STRIP = re.compile(r"[\s\-_]+")
_HANGUL = re.compile(r"[가-힣]")

# 일반명사 — 브랜드 전체명이 이것뿐이면 safe 금지(오탐 방지).
STOPWORD_KEYS: set[str] = {
    "티셔츠", "반팔", "셔츠", "무지", "기본", "베이직",
    "남성", "여성", "공용", "스포츠", "클럽",
}


def normalize_brand_key(s: str) -> str:
    return _STRIP.sub("", unicodedata.normalize("NFKC", s).lower()).strip()


def is_safe_alias(key: str, brand_count_by_key: dict[str, int]) -> bool:
    """safe 규칙: 충돌 없음 + 최소 길이(한글 포함 2자·ASCII 전용 3자) + 스톱워드 아님."""
    if brand_count_by_key.get(key, 0) > 1:
        return False
    if key in STOPWORD_KEYS:
        return False
    if _HANGUL.search(key):
        return len(key) >= 2
    return len(key) >= 3


def stale_brands(existing: set[str], current: set[str]) -> set[str]:
    """search_brand_aliases에 남아있는 catalog_brand 중 현재 search_goods distinct 브랜드
    집합에는 없는 것들(브랜드 개명·삭제 시 잔존 alias → 모호 키 방지 위해 삭제 대상)."""
    return existing - current


def build_alias_rows(brands: list[str]) -> list[dict]:
    """distinct 카탈로그 브랜드 → self-alias 행. 규칙 통과분만 hard_filter_safe=True."""
    pairs = [(normalize_brand_key(b), b) for b in brands if b and b.strip()]
    counts: dict[str, int] = {}
    for key, _ in pairs:
        counts[key] = counts.get(key, 0) + 1
    return [
        {
            "alias_normalized": key,
            "catalog_brand": brand,
            "hard_filter_safe": is_safe_alias(key, counts),
        }
        for key, brand in pairs
    ]
