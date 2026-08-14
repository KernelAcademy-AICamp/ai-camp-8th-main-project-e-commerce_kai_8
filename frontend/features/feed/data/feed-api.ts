import type { Product } from "@/features/feed/domain/product";

// Supabase RPC c_feed_page 응답 행 (snake_case)
export interface FeedProductDto {
  goods_no: number;
  title: string | null;
  brand_name: string | null;
  price_final: number;
  thumbnail: string;
  gender: string | null;
  gallery: string[];
  width: number;
  height: number;
}

// 갤러리는 DB에 상대경로로 저장돼 있다 (카탈로그 감사에서 확인)
const CDN_BASE = "https://image.msscdn.net";

export function mapFeedDto(dto: FeedProductDto): Product {
  return {
    goodsNo: dto.goods_no,
    title: dto.title ?? "티셔츠",
    brandName: dto.brand_name,
    priceFinal: dto.price_final,
    thumbnail: dto.thumbnail,
    gender: dto.gender,
    width: dto.width,
    height: dto.height,
    gallery: dto.gallery.map((path) =>
      path.startsWith("http") ? path : `${CDN_BASE}${path}`,
    ),
  };
}

/**
 * 무작위 피드 한 페이지를 받아온다.
 * seed가 같으면 순서가 고정되고(세션 내 스크롤 복원), after는 keyset 커서다.
 */
export async function fetchFeedPage(
  seed: number,
  after: number | null,
  size: number,
): Promise<Product[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 환경변수가 필요합니다 (frontend/.env.example 참고)",
    );
  }
  const res = await fetch(`${url}/rest/v1/rpc/c_feed_page`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_seed: seed, p_after: after, p_size: size }),
  });
  if (!res.ok) {
    throw new Error(`피드 로드 실패: HTTP ${String(res.status)}`);
  }
  const dtos = (await res.json()) as FeedProductDto[];
  return dtos.map(mapFeedDto);
}
