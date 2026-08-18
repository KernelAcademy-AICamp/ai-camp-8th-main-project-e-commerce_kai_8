-- 상품 임베딩(의미검색용). 제목+카테고리 자유텍스트를 bge-m3(1024차원)로 벡터화해 저장.
-- pgvector 확장은 init_products에서 이미 활성화됨. 차원은 모델 확정값(bge-m3=1024)에 고정.
alter table products add column if not exists embedding vector(1024);

-- HNSW cosine 인덱스: 근사 최근접 검색. 소~중 규모 카탈로그에 충분하고 삽입/조회 균형이 좋다.
create index if not exists products_embedding_idx
  on products using hnsw (embedding vector_cosine_ops);
