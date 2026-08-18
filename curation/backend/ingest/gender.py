"""제목 규칙 기반 성별 판정. 순수 함수 — brands.py와 나란히.
판정 우선순위: 공용신호 → 남·여 동시 → 여성 → 남성 → unisex(기본값)."""
import re

# 공용신호가 있으면 무조건 unisex (남녀공용/커플 등)
_UNISEX = re.compile(r"남녀공용|남녀|공용|유니섹스|unisex|커플", re.I)
_FEMALE = re.compile(r"여성|여자|우먼|우먼스|women|woman|female|레이디|girls?|걸스", re.I)
# '맨투맨'의 '맨'을 피하려 '맨즈/맨스'만. men은 women의 부분문자열이라 female을 먼저 판정.
_MALE = re.compile(r"남성|남자|맨즈|맨스|mens|men's|\bmale\b|\bman\b|\bmen\b", re.I)


def classify_gender(title: str) -> str:
    """제목에서 성별을 판정해 'male' | 'female' | 'unisex' 반환. 신호 없으면 'unisex'."""
    t = title or ""
    if _UNISEX.search(t):
        return "unisex"
    has_f, has_m = bool(_FEMALE.search(t)), bool(_MALE.search(t))
    if has_f and has_m:  # '남성 여성'처럼 둘 다면 공용으로 흡수
        return "unisex"
    if has_f:
        return "female"
    if has_m:
        return "male"
    return "unisex"
