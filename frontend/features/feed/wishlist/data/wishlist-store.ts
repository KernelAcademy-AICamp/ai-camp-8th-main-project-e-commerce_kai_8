// 이전 버전이 기기에 남긴 찜의 자리.
//
// 2026-08-19부터 찜은 **계정에만** 담긴다(조각 2). 여기에 새로 쓰는 곳은 없다.
// 남겨 두는 이유는 하나다 — 이 키에 아직 값이 있는 사용자가 있고, 그 값은
// 로그인할 때 계정으로 옮겨진다(shared/identity/wish-carry.ts).
//
// 옮기기가 끝나면 이 키는 지워진다. 옮길 사용자가 남지 않았다고 판단되면
// 이 파일도 지운다.

/** 신원 전환 쪽(shared/identity/wish-carry.ts)이 같은 값을 쓴다 — 테스트가 대조한다 */
export const WISHLIST_STORAGE_KEY = "atee-wishlist";
