"""가격 구간 분할 테스트. 목록 API의 1000페이지(=10만개) 상한을 넘지 않게 쪼갠다."""
from musinsa.c_shards import plan_price_shards, shard_id


def test_single_shard_when_under_limit():
    shards = plan_price_shards(lambda lo, hi: 5_000, limit=90_000)
    assert shards == [(0, None)]


def test_splits_until_every_shard_fits():
    """전체는 크지만 구간을 나누면 들어가는 경우."""
    def count(lo, hi):
        if lo == 0 and hi is None:
            return 200_000
        return 40_000
    shards = plan_price_shards(count, limit=90_000)
    assert len(shards) > 1
    assert all(count(lo, hi) <= 90_000 for lo, hi in shards)


def test_shards_are_disjoint_and_ordered():
    def count(lo, hi):
        return 200_000 if (lo == 0 and hi is None) else 10_000
    shards = plan_price_shards(count, limit=90_000)
    for (_, hi), (lo2, _) in zip(shards, shards[1:]):
        assert hi is not None
        assert lo2 == hi + 1          # 경계가 양끝 포함이므로 다음 구간은 +1에서 시작
    assert shards[0][0] == 0
    assert shards[-1][1] is None      # 마지막 구간은 열려 있다


def test_stops_splitting_when_range_too_narrow():
    """한 가격에 10만 개가 몰려 있으면 더 쪼갤 수 없다. 무한 재귀 대신 그대로 반환한다."""
    shards = plan_price_shards(lambda lo, hi: 500_000, limit=90_000, min_width=1000)
    assert shards                      # 빈 목록을 내놓지 않는다
    assert all(hi is None or hi - lo + 1 >= 1 for lo, hi in shards)


def test_shard_id_is_stable_and_readable():
    assert shard_id(0, 14999) == "0-14999"
    assert shard_id(150000, None) == "150000-inf"
