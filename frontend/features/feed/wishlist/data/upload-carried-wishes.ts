// 로그인할 때 보관함에 빼둔 기기 찜을 계정으로 올린다 (설계 §4 옮기기).
//
// **성공한 것만 보관함에서 뺀다.** 실패한 것은 남겨 다음 접속에 이어서 시도한다 —
// 삭제 재시도 목록과 같은 방식이다. 이미 계정에 있는 상품은 서버가 무시하므로
// 여러 번 올려도 결과가 같다.

import { clearCarriedWishes, readCarriedWishes } from "@/shared/identity/wish-carry";

import { WishlistFullError } from "./wishlist-api";

export interface CarryResult {
  /** 이번에 계정으로 올라간 개수 */
  uploaded: number;
  /** 아직 못 올린 개수 — 다음 접속에 다시 시도한다 */
  remaining: number;
  /** 상한에 걸려 멈췄는가 */
  capped: boolean;
}

export async function uploadCarriedWishes(
  add: (goodsNo: number) => Promise<void>,
  storage: Storage,
): Promise<CarryResult> {
  const goodsNos = readCarriedWishes(storage);
  if (goodsNos.length === 0) {
    return { uploaded: 0, remaining: 0, capped: false };
  }

  const remaining: number[] = [];
  let uploaded = 0;
  let capped = false;

  for (const goodsNo of goodsNos) {
    // 상한에 걸린 뒤에는 더 부르지 않는다 — 실패 요청만 늘어난다.
    if (capped) {
      remaining.push(goodsNo);
      continue;
    }
    try {
      await add(goodsNo);
      uploaded += 1;
    } catch (error) {
      if (error instanceof WishlistFullError) capped = true;
      remaining.push(goodsNo);
    }
  }

  clearCarriedWishes(storage, remaining);
  return { uploaded, remaining: remaining.length, capped };
}
