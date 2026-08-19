// 계정 찜 — 서버 호출. 로그인한 사용자만 쓸 수 있다.
//
// 익명 통로(`shared/supabase-rpc.ts`)를 쓰지 않는다. 계정 데이터는 인증 통로로만
// 나간다(조각 1 설계 §2 transport 경계).

import { toGalleryUrls } from "@/features/feed/domain/image-url";
import type { Product } from "@/features/feed/domain/product";
import type { WishlistEntry } from "@/features/feed/wishlist/domain/wishlist";
import { authedRpc, AuthedRpcError } from "@/shared/supabase/authed-rpc";

/** 서버가 상한 초과를 알리는 코드 (program_limit_exceeded) */
const CAP_EXCEEDED = "54000";

interface WishRowDto {
  goods_no: number;
  title: string | null;
  brand_name: string | null;
  price_final: number | null;
  thumbnail: string | null;
  gender: string | null;
  gallery: string[] | null;
  width: number | null;
  height: number | null;
  added_at: string;
}

function toEntry(dto: WishRowDto): WishlistEntry {
  const product: Product = {
    goodsNo: dto.goods_no,
    title: dto.title ?? "",
    brandName: dto.brand_name,
    priceFinal: dto.price_final ?? 0,
    thumbnail: dto.thumbnail ?? "",
    gender: dto.gender,
    width: dto.width ?? 0,
    height: dto.height ?? 0,
    // 서버(c_wish_page)는 c_goods의 상대경로를 그대로 내려준다 — 피드와 같은
    // 규칙으로 호스트를 붙인다. 안 붙이면 상세가 첫 장만 보인다.
    gallery: toGalleryUrls(dto.gallery ?? []),
  };
  return { product, addedAtMs: Date.parse(dto.added_at) };
}

/** 이 계정의 찜 목록 — 최근에 찜한 것부터 */
export async function fetchAccountWishes(): Promise<WishlistEntry[]> {
  const rows = await authedRpc<WishRowDto[] | null>("c_wish_page");
  return (rows ?? []).map(toEntry);
}

/** 상한에 걸려 더 담을 수 없을 때 — 화면이 다른 문구를 보여줄 수 있게 구분한다 */
export class WishlistFullError extends Error {
  constructor() {
    super("찜은 최대 500개까지 담을 수 있습니다");
    this.name = "WishlistFullError";
  }
}

export async function addAccountWish(goodsNo: number): Promise<void> {
  try {
    await authedRpc<number>("c_wish_add", { p_goods: goodsNo });
  } catch (error) {
    if (error instanceof AuthedRpcError && error.code === CAP_EXCEEDED) {
      throw new WishlistFullError();
    }
    throw error;
  }
}

export async function removeAccountWish(goodsNo: number): Promise<void> {
  await authedRpc<number>("c_wish_remove", { p_goods: goodsNo });
}
