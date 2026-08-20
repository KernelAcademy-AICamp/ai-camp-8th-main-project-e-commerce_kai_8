"""직전 스냅샷 대비 변화를 뽑는다. 스냅샷이 하루치뿐이면 c_goods(2026-08-12 수집)를 기준선으로 쓴다.

신호 = review_count 증가량(그 기간에 실제로 팔린 양의 대리 지표).
실행: python3 report_trend_diff.py
"""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run_trend_snapshot import load_env  # noqa: E402

NOISE = ('반팔티', '티셔츠', '반팔티셔츠', '반팔', '반소매티셔츠', '반소매', '여름티셔츠',
         '여름반팔', '여름반팔티', '반팔티추천', '데일리', '무배당발', '여름', '신상',
         '남자반팔티', '여자반팔티', '여성티셔츠', '남성티셔츠')


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    env = load_env(os.path.join(here, ".env.local"))
    with psycopg.connect(env["SUPABASE_DB_URL"], connect_timeout=30) as conn, conn.cursor() as cur:
        cur.execute("select distinct snap_date from m_trend_daily order by 1 desc limit 2")
        dates = [r[0] for r in cur.fetchall()]
        if not dates:
            print("스냅샷이 없다. run_trend_snapshot.py 를 먼저 돌린다.")
            return

        cur_date = dates[0]
        if len(dates) >= 2:
            prev_date, base = dates[1], "snapshot"
            prev_sql = ("select goods_no, review_count, rank_no from m_trend_daily "
                        "where snap_date = %s")
            params = (prev_date,)
        else:
            base = "c_goods"
            cur.execute("select max(fetched_at)::date from c_goods")
            prev_date = cur.fetchone()[0]
            prev_sql = ("select goods_no, review_count, null::int from c_goods "
                        "where %s is not null")
            params = (prev_date,)

        print(f"기준 {prev_date} ({base}) → 현재 {cur_date}  /  {(cur_date - prev_date).days}일 간격\n")

        cur.execute(f"""
            with prev as ({prev_sql}),
            d as (
              select t.goods_no, t.rank_no, t.brand,
                     t.review_count - p.review_count as drv, t.review_count as rc
              from m_trend_daily t join prev p(goods_no, review_count, prank) using (goods_no)
              where t.snap_date = %s and t.review_count is not null and p.review_count is not null
            )
            select d.goods_no, left(g.title, 34), d.brand, d.rank_no, d.drv, d.rc
            from d join c_goods g using (goods_no)
            order by d.drv desc limit 12""", params + (cur_date,))
        print("=== 리뷰 급증 상품 (기간 내 판매 속도) ===")
        print("순위 | 리뷰증가 | 누적 | 브랜드 | 상품")
        for gno, title, brand, rank, drv, rc in cur.fetchall():
            print(f"{rank:>3} | +{drv:<6} | {rc:>5} | {brand[:14]:<14} | {title}")

        cur.execute(f"""
            with prev as ({prev_sql}),
            d as (
              select t.goods_no, t.review_count - p.review_count as drv
              from m_trend_daily t join prev p(goods_no, review_count, prank) using (goods_no)
              where t.snap_date = %s and t.review_count is not null and p.review_count is not null
            )
            select tag, count(*) n, sum(drv) total, round(avg(drv), 1) per_item
            from d join c_goods g using (goods_no), unnest(g.tags) tag
            where tag <> all(%s)
            group by tag having count(*) >= 5
            order by per_item desc limit 18""", params + (cur_date, list(NOISE)))
        print("\n=== 태그별 판매 속도 (상품당 평균 리뷰 증가) ===")
        print("태그 | 상품수 | 리뷰증가합 | 상품당")
        for tag, n, total, per in cur.fetchall():
            print(f"{tag} | {n} | {total} | {per}")


if __name__ == "__main__":
    main()
