// 계정 찜을 실제로 바꾸는 동작 — 화면 사이에 **하나만** 둔다.
//
// 전송 순서 관리자를 컴포넌트마다 만들면 같은 상품에 서로 다른 요청을 보내고,
// 어느 쪽이 이겼는지 아무도 모른다. 공유 저장소와 짝을 이루는 짝꿍이다.

import {
  setAccountFolders,
  setAccountNotice,
  setAccountWishes,
} from "@/features/feed/wishlist/data/account-wishlist-store";
import { uploadCarriedWishes } from "@/features/feed/wishlist/data/upload-carried-wishes";
import { createWishSync } from "@/features/feed/wishlist/data/wish-sync";
import {
  addAccountWish,
  createWishFolder,
  deleteWishFolder,
  fetchAccountWishes,
  fetchWishFolders,
  removeAccountWish,
  renameWishFolder,
  WishlistFullError,
} from "@/features/feed/wishlist/data/wishlist-api";
import { logAction } from "@/shared/signals/signals";

/**
 * 서버에서 계정 찜과 폴더를 다시 읽어 저장소를 맞춘다.
 *
 * 읽은 상태를 전송 관리자에게도 알린다 — 알리지 않으면 서버에 이미 담긴 찜을
 * 풀 때 "이미 그 상태"로 보고 요청을 건너뛴다.
 */
export async function reloadAccountWishes(): Promise<void> {
  try {
    const [entries, folders] = await Promise.all([
      fetchAccountWishes(),
      fetchWishFolders(),
    ]);
    setAccountWishes(entries);
    setAccountFolders(folders);
    for (const entry of entries) {
      sync.setConfirmed(entry.product.goodsNo, true);
    }
  } catch {
    setAccountNotice("failed");
  }
}

const sync = createWishSync(
  (goodsNo, wanted, folderId) =>
    wanted ? addAccountWish(goodsNo, folderId) : removeAccountWish(goodsNo),
  (goodsNo, confirmed, cause) => {
    // **시도를 취소하지 않고 실패를 따로 남긴다** (정의 §3). 실패했다고 시도를
    // 지우면 "찜하려 했는데 안 됐다"가 통째로 사라져 제품이 멀쩡해 보인다.
    //
    // confirmed=false = 되돌아간 상태가 "안 찜함" = **실패한 동작이 찜 저장**이다.
    // 해제 실패(confirmed=true)는 세지 않는다 — 실패율의 분모가 찜 시도라
    // 함께 세면 비율이 뜻을 잃는다.
    if (!confirmed) logAction("wish_failed", goodsNo);
    setAccountNotice(cause instanceof WishlistFullError ? "full" : "failed");
    // 되돌리기는 서버를 다시 읽어 맞춘다. 화면에서 지운 상품의 정보를 되살릴
    // 방법이 이것뿐이고, 어긋난 채로 두는 것보다 낫다.
    void reloadAccountWishes();
  },
);

/** 이 상품을 wanted 상태로 만들고 싶다고 알린다. 순서는 sync가 맡는다. */
export function requestAccountWish(
  goodsNo: number,
  wanted: boolean,
  folderId: string | null = null,
): void {
  sync.request(goodsNo, wanted, folderId);
}

// ── 폴더 동작 ───────────────────────────────────────────────────────────────
// 찜 토글과 달리 연타 경합이 없다 — 서버 확답을 기다렸다가 목록을 다시 읽는다.
// 실패는 호출한 화면이 그 자리에서 알린다(DuplicateFolderError 등을 그대로 던짐).

/** 폴더를 만들고 새 id를 돌려준다 */
export async function createAccountFolder(name: string): Promise<string> {
  const id = await createWishFolder(name);
  setAccountFolders(await fetchWishFolders());
  return id;
}

export async function renameAccountFolder(
  folderId: string,
  name: string,
): Promise<void> {
  await renameWishFolder(folderId, name);
  setAccountFolders(await fetchWishFolders());
}

/** 폴더를 지운다 — 안의 찜은 기본 폴더로 옮겨진 채 살아 있다 */
export async function deleteAccountFolder(folderId: string): Promise<void> {
  await deleteWishFolder(folderId);
  // 찜의 folder_id도 바뀌었으므로 둘 다 다시 읽는다
  await reloadAccountWishes();
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
