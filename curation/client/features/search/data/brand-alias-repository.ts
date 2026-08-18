// 서버 전용 — search_brand_aliases에서 safe alias만 로드. 모듈 캐시(TTL 5분).
// 실패는 throw — 설계 §4.4: DB/사전 조회 실패 → mode "failed"(호출자 처리).
import type { BrandAlias } from "@/features/search/domain/match-brand";

interface AliasRow {
  alias_normalized: string;
  catalog_brand: string;
}

// order()는 체이닝 가능(복합 PK 전체를 커버하는 total order를 위해 2회 호출).
interface OrderedAliasQuery {
  order(column: string, options: { ascending: boolean }): OrderedAliasQuery;
  range(
    from: number,
    to: number,
  ): PromiseLike<{
    data: AliasRow[] | null;
    error: unknown;
  }>;
}

// route의 supabase 클라이언트가 구조적으로 만족하는 최소 표면.
export interface AliasDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): OrderedAliasQuery;
    };
  };
}

const TTL_MS = 5 * 60_000;
const PAGE_SIZE = 1000; // PostgREST max_rows=1000 — 이 이상은 페이지네이션 없이 조용히 절단된다.
let cache: { at: number; aliases: BrandAlias[] } | null = null;

export function _clearAliasCache(): void {
  cache = null;
}

export async function getSafeBrandAliases(db: AliasDb): Promise<BrandAlias[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.aliases;

  const rows: AliasRow[] = [];
  for (let off = 0; ; off += PAGE_SIZE) {
    // offset 페이지네이션에 order()는 필수 — 정렬 없이 range()하면 페이지 간 중복·누락 가능.
    // 복합 PK(alias_normalized, catalog_brand) 전체로 정렬해야 total order —
    // alias_normalized만 정렬하면 동률이 페이지 경계에서 중복·누락될 수 있다.
    const { data, error } = await db
      .from("search_brand_aliases")
      .select("alias_normalized,catalog_brand")
      .eq("hard_filter_safe", true)
      .order("alias_normalized", { ascending: true })
      .order("catalog_brand", { ascending: true })
      .range(off, off + PAGE_SIZE - 1);
    if (error || !data) {
      throw new Error("search_brand_aliases 조회 실패");
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  const aliases = rows.map((r) => ({
    aliasNormalized: r.alias_normalized,
    catalogBrand: r.catalog_brand,
  }));
  cache = { at: Date.now(), aliases };
  return aliases;
}
