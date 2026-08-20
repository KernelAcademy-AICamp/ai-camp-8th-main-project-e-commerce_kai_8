-- 트렌드 일별 스냅샷.
-- c_goods는 2026-08-12에 한 번 긁은 스냅샷 1장이라 "무엇이 늘고 있나"를 못 잰다.
-- 매일 append 해서 변화량을 만든다. 신호 = 순위 상승 + review_count 증가(판매 속도).
-- 무신사 PLP 응답에는 likeCount가 없다 — reviewCount 증분이 대체 지표.

create table if not exists m_trend_daily (
  snap_date    date   not null,
  category     text   not null,
  goods_no     bigint not null,
  rank_no      int    not null,
  review_count int,
  review_score int,           -- 0~100 스케일 (4.5점 = 90)
  final_price  int,
  is_sold_out  boolean,
  brand        text,
  primary key (snap_date, category, goods_no)
);
create index if not exists m_trend_daily_goods on m_trend_daily (goods_no, snap_date);

-- 카테고리 온도계: 무신사가 매일 재계산하는 "AI 추천" 하한선(별점·후기·좋아요 컷).
-- 2026-08-19 좋아요 컷 370 → 08-20 360 으로 실제 움직이는 것을 관측했다.
create table if not exists m_trend_thresholds (
  snap_date    date not null,
  category     text not null,
  param_key    text not null,
  value        text not null,
  display_text text,
  primary key (snap_date, category, param_key, value)
);

revoke insert, update, delete, truncate on m_trend_daily from anon, authenticated;
revoke insert, update, delete, truncate on m_trend_thresholds from anon, authenticated;
