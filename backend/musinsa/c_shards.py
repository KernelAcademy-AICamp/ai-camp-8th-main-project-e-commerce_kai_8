"""가격 구간 분할. 목록 API의 페이징 상한을 우회하는 유일한 수단이다.

무신사 PLP는 1000페이지가 상한이고 size는 100이 최대라, 한 질의로 10만 개까지만 훑을 수 있다.
상한을 넘으면 오류가 아니라 빈 list와 totalCount:0을 돌려주기 때문에 조용히 누락된다.
반소매 한 카테고리만 12만 개가 넘으므로 반드시 쪼개야 한다.

가격은 상품마다 하나씩 있는 스칼라라 겹치지 않게 나눌 수 있다.
minPrice/maxPrice는 양끝을 포함한다(실측: [0,20000] = [0,19999] + [20000,20000]).
따라서 다음 구간은 이전 구간의 상한 + 1에서 시작한다.

⚠️ 패싯 문서에 적힌 `price`·`priceRange` 파라미터는 무시된다. minPrice/maxPrice만 동작한다.
"""

# 열린 구간의 실질 상한. 무신사 최고가 상품보다 충분히 크다.
_MAX_PRICE = 10_000_000


def shard_id(lo: int, hi: int | None) -> str:
    return f"{lo}-{'inf' if hi is None else hi}"


def plan_price_shards(count_fn, *, limit: int = 90_000, min_width: int = 1000
                      ) -> list[tuple[int, int | None]]:
    """count_fn(lo, hi) -> 그 가격 구간의 상품 수. 모든 구간이 limit 이하가 되게 쪼갠다.

    limit은 상한(10만)보다 낮게 잡는다. 수집 중 카탈로그가 늘어 상한을 넘기지 않도록 하는 여유다.
    """
    out: list[tuple[int, int | None]] = []

    def walk(lo: int, hi: int | None) -> None:
        n = count_fn(lo, hi)
        width = (_MAX_PRICE if hi is None else hi) - lo + 1
        if n <= limit or width <= min_width:
            # 더 쪼갤 수 없으면 그대로 둔다. 누락은 남지만 무한 재귀보다 낫다.
            out.append((lo, hi))
            return
        top = _MAX_PRICE if hi is None else hi
        mid = lo + (top - lo) // 2
        walk(lo, mid)
        walk(mid + 1, hi)

    walk(0, None)
    return out


def musinsa_count_fn(mc, category: str):
    """무신사 실제 건수 조회기. plan_price_shards에 넘긴다."""
    def count(lo: int, hi: int | None) -> int:
        extra: dict = {"minPrice": lo}
        if hi is not None:
            extra["maxPrice"] = hi
        return mc.list_page(category, 1, size=1, extra=extra)["pagination"]["totalCount"]
    return count
