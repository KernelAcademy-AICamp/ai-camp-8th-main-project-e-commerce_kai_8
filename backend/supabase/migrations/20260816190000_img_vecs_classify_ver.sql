-- 이미지 분류 버전 열 (개인화 3차 계획 2단계).
--
-- 표·라벨(3류) 재분류(reclassify.py, 분류 버전 2)를 서버에 반영할 때
-- 어떤 행이 새 분류인지 판별·재개할 수 있도록 버전을 기록한다.
-- null = v1 원 분류 유지(라벨 불변이라 물리 갱신 안 함), 2 = 세트 C 재분류 반영.
-- 라벨 변경 행만 갱신하는 이유: 벡터 테이블 UPDATE는 대부분 non-HOT라 전량
-- 재기록 시 IVFFlat·이진 인덱스가 함께 팽창한다(Micro 인스턴스 캐시 축출).
-- 서버 type_conf는 RPC 로직에 쓰이지 않는 참고값(v1/v2 혼재 허용, 정본은 로컬 DB).

alter table c_img_vecs add column if not exists classify_ver smallint;

comment on column c_img_vecs.classify_ver is
  '이미지 유형 분류 버전. null=v1 유지, 2=2026-08-16 세트 C 재분류(backend/embed/reclassify.py).';
