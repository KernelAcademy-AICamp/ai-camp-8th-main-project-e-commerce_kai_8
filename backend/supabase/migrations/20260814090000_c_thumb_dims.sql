-- 썸네일 원본 픽셀 크기 (2026-08-14 피드 실데이터 연결 계획 1단계).
-- 피드가 이미지 로딩 전 카드 영역을 예약하려면 가로·세로가 필요한데
-- c_goods에도 원본(c_raw_goods)에도 없어 이미지 헤더를 직접 재서 채운다 (run_thumb_dims.py).
--
-- c_goods에 열을 추가하지 않는 이유: 226,320행 전체 UPDATE는 MVCC 행 복사로
-- 테이블이 일시적으로 ~2배(620MB)까지 부풀어 무료 플랜 500MB 한도를 넘을 수 있다.
-- 별도 좁은 테이블은 신규 삽입 ~15MB로 끝나고, 무작위 피드 페이지 RPC의
-- 스캔 대상(좁아서 빠름)으로도 쓴다.
create table if not exists c_thumb_dims (
  goods_no bigint primary key references c_goods (goods_no) on delete cascade,
  -- 측정 실패는 width=0, height=0으로 기록해 재시도 대상에서 뺀다.
  width  int2 not null,
  height int2 not null
);

alter table c_thumb_dims enable row level security;
revoke insert, update, delete, truncate on c_thumb_dims from anon, authenticated;
