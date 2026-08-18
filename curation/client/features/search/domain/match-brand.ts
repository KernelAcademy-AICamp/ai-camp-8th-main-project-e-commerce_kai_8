// 결정적 브랜드 매칭 — 쿼리 토큰 n-gram(1~3)을 safe alias 사전에 정확 매칭.
// 경계 없는 includes 금지(부분 문자열 오탐 방지). 긴 n-gram 우선, 동률이면 좌측 우선.
// 입력 aliases는 리포지토리가 hard_filter_safe=true만 로드 → 매칭 성공 = safe(불변식).
import { stripJosa } from "@/features/search/domain/extract-title-tokens";
import { normalizeBrandKey } from "@/features/search/domain/normalize-brand";

export interface BrandAlias {
  aliasNormalized: string;
  catalogBrand: string;
}

export interface BrandMatch {
  brand: string;
  consumedTokens: string[]; // 매칭에 소비된 원문 토큰(제목 토큰 추출에서 제외용)
}

// 현 카탈로그 최대 3토큰이나, 향후 4~5토큰 브랜드(예: 로우클래식 등 복합명) 대비 확장.
const MAX_NGRAM = 5;

export function matchBrandDetailed(
  query: string,
  aliases: BrandAlias[],
): BrandMatch | undefined {
  if (!aliases.length) return undefined;

  const byKey = new Map<string, string | null>();
  for (const a of aliases) {
    const prev = byKey.get(a.aliasNormalized);
    if (prev === undefined) byKey.set(a.aliasNormalized, a.catalogBrand);
    else if (prev !== a.catalogBrand) byKey.set(a.aliasNormalized, null);
  }

  // 원문 토큰을 보존해 소비 토큰을 되돌려준다(정규화는 키 계산에서만).
  const rawTokens = query.normalize("NFKC").split(/\s+/).filter(Boolean);
  const lowTokens = rawTokens.map((t) => t.toLowerCase());

  for (let n = Math.min(MAX_NGRAM, lowTokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= lowTokens.length; i++) {
      const slice = lowTokens.slice(i, i + n);
      const key = normalizeBrandKey(slice.join(""));
      const brand = byKey.get(key);
      if (brand) return { brand, consumedTokens: rawTokens.slice(i, i + n) };

      // 조사 허용(설계 §4.5) — 마지막 토큰에서 조사를 벗긴 변형 키도 시도.
      // consumedTokens는 항상 원문(조사 포함) 그대로 반환.
      const lastStripped = stripJosa(slice[n - 1]);
      if (lastStripped !== slice[n - 1]) {
        const altKey = normalizeBrandKey(
          [...slice.slice(0, -1), lastStripped].join(""),
        );
        const altBrand = byKey.get(altKey);
        if (altBrand)
          return { brand: altBrand, consumedTokens: rawTokens.slice(i, i + n) };
      }
    }
  }
  return undefined;
}

export function matchBrand(query: string, aliases: BrandAlias[]): string | undefined {
  return matchBrandDetailed(query, aliases)?.brand;
}
