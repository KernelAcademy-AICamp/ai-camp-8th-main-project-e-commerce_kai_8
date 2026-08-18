// 브랜드 키 정규화 — Python(backend/musinsa/brand_aliases.py)과 동일 규칙.
// 공통 벡터(normalize-brand.vectors.json)로 양쪽 동일성을 테스트한다.
export function normalizeBrandKey(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-_]+/g, "")
    .trim();
}
