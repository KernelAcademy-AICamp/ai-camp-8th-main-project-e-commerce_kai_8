"""매일 아침 무신사 반소매 인기순 상위 N + AI추천 임계값을 찍어 쌓는다.

신호: 순위 상승 + review_count 증가(=판매 속도). 하루치만으로는 아무 의미가 없고,
이틀째부터 diff 가 나온다.  실행:  python3 run_trend_snapshot.py
"""
import datetime as dt
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from musinsa.client import MusinsaClient  # noqa: E402

CATEGORY = "001001"          # 반소매 티셔츠
PAGES = 5                    # ponytail: 상위 500개만. 더 넓히려면 PAGES만 올린다.
SIZE = 100


def load_env(path: str) -> dict:
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def fetch_rows(mc, today):
    rows, rank = [], 0
    for page in range(1, PAGES + 1):
        data = mc.list_page(CATEGORY, page, SIZE, {"sortCode": "POPULAR"})
        items = data.get("list", [])
        if not items:
            break
        for it in items:
            if it.get("isAd"):        # 광고는 순위가 아니다
                continue
            rank += 1
            rows.append((today, CATEGORY, it["goodsNo"], rank, it.get("reviewCount"),
                         it.get("reviewScore"), it.get("finalPrice"),
                         it.get("isSoldOut"), it.get("brand")))
        if not data.get("pagination", {}).get("hasNext"):
            break
    return rows


def fetch_thresholds(mc, today):
    """'AI 추천' facet = 카테고리별로 매일 재계산되는 하한선."""
    data = mc.filter_facets(CATEGORY)
    out, found = [], None

    def walk(o):
        nonlocal found
        if isinstance(o, dict):
            if "aiKeyword" in o and not found:
                found = o["aiKeyword"]
                return
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(data)
    for x in (found or {}).get("list", []):
        out.append((today, CATEGORY, x.get("parameterKey"), str(x.get("value")),
                    x.get("displayText")))
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    env = load_env(os.path.join(here, ".env.local"))
    today = dt.date.today()
    mc = MusinsaClient()

    rows = fetch_rows(mc, today)
    thr = fetch_thresholds(mc, today)

    with psycopg.connect(env["SUPABASE_DB_URL"], connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """insert into m_trend_daily
                   (snap_date,category,goods_no,rank_no,review_count,review_score,
                    final_price,is_sold_out,brand)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   on conflict (snap_date,category,goods_no) do update set
                     rank_no=excluded.rank_no, review_count=excluded.review_count,
                     review_score=excluded.review_score, final_price=excluded.final_price,
                     is_sold_out=excluded.is_sold_out""", rows)
            cur.executemany(
                """insert into m_trend_thresholds
                   (snap_date,category,param_key,value,display_text)
                   values (%s,%s,%s,%s,%s)
                   on conflict (snap_date,category,param_key,value) do update set
                     display_text=excluded.display_text""", thr)
            cur.execute("select count(distinct snap_date) from m_trend_daily")
            days = cur.fetchone()[0]
        conn.commit()

    print(f"[{today}] 상품 {len(rows)}행 · 임계값 {len(thr)}행 저장. 누적 {days}일치.\n")

    # 저장 직후 변화 리포트까지 찍는다 — 로그만 열면 "무엇이 떴나"가 보이도록.
    from report_trend_diff import main as report
    report()


if __name__ == "__main__":
    main()
