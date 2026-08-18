"""브랜드 사전 매처. brands 테이블(canonical + aliases)로 제목/brand/maker/mall_name에서
브랜드를 찾는다. 순수 함수 — DB 접근은 호출자가 담당(entries만 넘긴다)."""
import re

_BRACKET = re.compile(r"\[[^\]]*\]")  # [매장발송] [롯데백화점] 등 프로모 프리픽스
_MALL_PREFIX = re.compile(r"^\S+?/")  # '하프클럽/...' 앞 몰 프리픽스


def _clean_title(title: str) -> str:
    t = _BRACKET.sub(" ", title or "")
    t = _MALL_PREFIX.sub("", t.strip())
    return t.lower()


def _is_valid(value: str | None) -> bool:
    v = (value or "").strip()
    return bool(v) and v.upper() != "UNKNOWN"


def build_matcher(entries: list[dict]) -> list[tuple[str, str]]:
    """(alias_lower, canonical) 쌍을 alias 길이 내림차순으로. 긴 별칭이 먼저 매칭되게."""
    pairs: list[tuple[str, str]] = []
    for e in entries:
        canonical = e["canonical"]
        for alias in e.get("aliases") or [canonical]:
            pairs.append((alias.lower(), canonical))
    pairs.sort(key=lambda p: len(p[0]), reverse=True)
    return pairs


def _find(text: str, matcher: list[tuple[str, str]]) -> str | None:
    low = text.lower()
    for alias, canonical in matcher:
        if alias and alias in low:
            return canonical
    return None


def resolve_brand(
    title: str,
    brand: str | None,
    maker: str | None,
    mall_name: str | None,
    matcher: list[tuple[str, str]],
) -> str | None:
    """brand → maker → mall_name → title 순으로 사전 별칭을 찾아 canonical 반환. 없으면 None.
    brand/maker/mall_name은 값이 정확(자사몰명·필드)이라 우선. title은 오탐 여지가 있어 마지막."""
    for field in (brand, maker, mall_name):
        if _is_valid(field):
            hit = _find(field.strip(), matcher)  # type: ignore[union-attr]
            if hit:
                return hit
    return _find(_clean_title(title), matcher)
