// 데이터 접근: search_goods 뷰 단건 조회 → Goods. 브라우저 anon(뷰는 anon SELECT 허용).
import type { Goods } from "@/features/catalog/domain/goods";
import { mapGoodsRow, type SearchGoodsRow } from "@/features/search/data/map-goods-row";

import { supabase } from "./supabase-client";

// 상세 전용 전체 컬럼(gallery·size_measures 포함). "*"는 이 클라이언트(무-Database 제네릭)에서
// 애노테이션된 반환 타입과 결합 시 overrideTypes 제네릭 추론이 깨져 tsc가 실패한다(실측 확인) — 명시 목록 사용.
const DETAIL_COLUMNS =
  "goods_no,style_key,title,brand,category,gender,season,color,colors,patterns," +
  "materials,fits,sizes,size_free,size_std,price,review_count,review_score,gallery," +
  "url,thumbnail,wear_chars,review_tags,size_measures,prints";

async function fetchByGoodsNo(goodsNo: string): Promise<SearchGoodsRow | null> {
  const { data, error } = await supabase
    .from("search_goods")
    .select(DETAIL_COLUMNS)
    .eq("goods_no", goodsNo)
    .maybeSingle()
    .overrideTypes<SearchGoodsRow, { merge: false }>();
  if (error || !data) return null;
  return data;
}

export async function getByGoodsNo(
  goodsNo: string,
  fetchFn: (n: string) => Promise<SearchGoodsRow | null> = fetchByGoodsNo,
): Promise<Goods | null> {
  try {
    const row = await fetchFn(goodsNo);
    return row ? mapGoodsRow(row) : null;
  } catch {
    return null;
  }
}
