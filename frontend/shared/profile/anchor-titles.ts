// 앵커 상품의 제목 조회 — PICKS 개인화가 큐레이션 규칙을 판정할 재료 (계획 3단계).
//
// 제목은 카탈로그 공개 정보이고 바뀌지 않으므로 한 번 받아 캐시에 둔다. 그래서
// 두 번째 방문부터는 조회 없이 마운트 즉시 개인화 순서가 나온다 — 목록이 기본
// 6장에서 개인화 6장으로 늦게 바뀌는 것이 화면 튐으로 보이지 않게 하는 값싼 방법.
//
// 판정 규칙 자체는 features/curation/domain/curation-match가 갖는다. 여기는 재료만
// 만든다 — shared는 feature를 import하지 않는다(frontend/AGENTS.md).

import { restSelect } from "@/shared/supabase-rpc";

const CACHE_KEY = "atee-anchor-titles";
/** 한 번에 물어보는 상품 수 상한 — 앵커는 장기 50 + 세션 20이 상한이다 */
const FETCH_MAX = 70;

interface TitleRow {
  goods_no: number;
  title: string | null;
}

/** 가중치 붙은 앵커 제목 */
export interface WeightedTitle {
  title: string;
  weight: number;
}

type TitleCache = Record<string, string | undefined>;

function readCache(): TitleCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return typeof parsed === "object" && parsed !== null ? (parsed as TitleCache) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: TitleCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 저장 불가 — 매번 조회로 동작 (느릴 뿐 결과는 같다)
  }
}

/** 캐시에 있는 것만으로 만든 앵커 제목 목록. 조회하지 않으므로 동기다. */
export function cachedAnchorTitles(
  anchors: { goodsNo: number; weight: number }[],
): WeightedTitle[] {
  const cache = readCache();
  return anchors
    .map((a) => ({ title: cache[String(a.goodsNo)], weight: a.weight }))
    .filter((a): a is WeightedTitle => a.title !== undefined);
}

/**
 * 캐시에 없는 앵커 제목을 한 번의 in-list 조회로 채운다.
 * @returns 새로 받은 것이 있으면 true (호출부가 순서를 다시 계산한다)
 */
export async function fetchMissingAnchorTitles(
  anchors: { goodsNo: number; weight: number }[],
): Promise<boolean> {
  const cache = readCache();
  const missing = anchors
    .map((a) => a.goodsNo)
    .filter((g) => cache[String(g)] === undefined)
    .slice(0, FETCH_MAX);
  if (missing.length === 0) return false;
  const rows = await restSelect<TitleRow[]>(
    `c_feed_products?select=goods_no,title&goods_no=in.(${missing.join(",")})`,
  );
  for (const row of rows) {
    if (row.title) cache[String(row.goods_no)] = row.title;
  }
  writeCache(cache);
  return rows.length > 0;
}

/** 개인화 데이터 초기화에서 함께 지운다 — 어떤 상품에 반응했는지가 남아 있다 */
export function clearAnchorTitles(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // 저장소 접근 불가면 지울 것도 없다
  }
}
