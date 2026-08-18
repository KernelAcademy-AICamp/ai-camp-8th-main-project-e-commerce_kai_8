// 계정 찜을 실제로 바꾸는 동작 — 화면 사이에 **하나만** 둔다.
//
// 전송 순서 관리자를 컴포넌트마다 만들면 같은 상품에 서로 다른 요청을 보내고,
// 어느 쪽이 이겼는지 아무도 모른다. 공유 저장소와 짝을 이루는 짝꿍이다.

import {
  setAccountNotice,
  setAccountWishes,
} from "@/features/feed/wishlist/data/account-wishlist-store";
import { uploadCarriedWishes } from "@/features/feed/wishlist/data/upload-carried-wishes";
import { createWishSync } from "@/features/feed/wishlist/data/wish-sync";
import {
  addAccountWish,
  fetchAccountWishes,
  removeAccountWish,
  WishlistFullError,
} from "@/features/feed/wishlist/data/wishlist-api";

/**
 * 서버에서 계정 찜을 다시 읽어 저장소를 맞춘다.
 *
 * 읽은 상태를 전송 관리자에게도 알린다 — 알리지 않으면 서버에 이미 담긴 찜을
 * 풀 때 "이미 그 상태"로 보고 요청을 건너뛴다.
 */
export async function reloadAccountWishes(): Promise<void> {
  try {
    const entries = await fetchAccountWishes();
    setAccountWishes(entries);
    for (const entry of entries) {
      sync.setConfirmed(entry.product.goodsNo, true);
    }
  } catch {
    setAccountNotice("failed");
  }
}

const sync = createWishSync(
  (goodsNo, wanted) => (wanted ? addAccountWish(goodsNo) : removeAccountWish(goodsNo)),
  (_goodsNo, _confirmed, cause) => {
    setAccountNotice(cause instanceof WishlistFullError ? "full" : "failed");
    // 되돌리기는 서버를 다시 읽어 맞춘다. 화면에서 지운 상품의 정보를 되살릴
    // 방법이 이것뿐이고, 어긋난 채로 두는 것보다 낫다.
    void reloadAccountWishes();
  },
);

/** 이 상품을 wanted 상태로 만들고 싶다고 알린다. 순서는 sync가 맡는다. */
export function requestAccountWish(goodsNo: number, wanted: boolean): void {
  sync.request(goodsNo, wanted);
}

/**
 * 로그인 상태가 되면 부른다.
 *
 * **올리기가 먼저다.** 목록을 먼저 읽으면 방금 옮긴 것이 빠진 목록을 보게 된다.
 * 올리기가 실패해도 목록은 읽는다 — 이미 계정에 있는 찜은 보여야 한다.
 */
export async function syncAccountWishesOnSignIn(): Promise<void> {
  try {
    const result = await uploadCarriedWishes(addAccountWish, localStorage);
    if (result.capped) setAccountNotice("full");
  } catch {
    // 옮기기에 실패해도 보관함은 남는다. 다음 접속에 다시 시도한다.
  }
  await reloadAccountWishes();
}
