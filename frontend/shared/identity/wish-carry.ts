// 로그인할 때 기기 찜을 계정으로 옮기기 위한 **중간 보관함** — 순수 규칙 + 키 조작.
//
// 왜 보관함이 필요한가: 로그인하면 신원 전환 정리가 **먼저** 돌아 기기 찜을 지우고
// 페이지를 다시 불러온다. 그대로 두면 옮길 것이 이미 사라진 뒤다. 그래서 지우기
// 전에 여기로 빼두고, 다시 뜬 뒤에 서버로 올린다.
//
// 이 파일이 찜 feature를 import하지 않는 이유: 정리 순서를 아는 곳은 신원 전환
// 쪽이고, 여기서 하는 일은 **저장소 키를 옮기는 것뿐**이다. 값의 의미는 올리는
// 쪽(찜 feature)이 해석한다.

import { ANONYMOUS } from "./identity-marker";

/**
 * 신원 전환에도 살아남아야 한다.
 * 지키는 쪽은 identity-scoped-keys.ts의 남길 목록이다.
 */
export const WISH_CARRY_KEY = "atee-wishlist-migrate";

/**
 * 기기 찜이 담긴 자리.
 *
 * 값의 정본은 찜 저장소다. 어긋나면 테스트가 잡는다
 * (wish-carry.test.ts가 두 값이 같은지 확인한다).
 */
const WISHLIST_KEY = "atee-wishlist";

/**
 * 옮겨야 하는 전환인가?
 *
 * **익명 → 사용자일 때만 참이다.**
 * - 사용자 → 익명(로그아웃): 로컬에 있던 것은 이미 계정에 있다.
 * - 사용자 A → 사용자 B: 옮기면 **A의 찜이 B 계정으로 들어간다.**
 */
export function shouldCarryWishes(previous: string | null, current: string): boolean {
  if (previous === null || previous === current) return false;
  return previous === ANONYMOUS && current !== ANONYMOUS;
}

/** 기기 찜을 보관함으로 옮긴다. 신원 종속 저장소를 정리하기 **전에** 부른다. */
export function carryWishes(storage: Storage): void {
  try {
    const wishes = storage.getItem(WISHLIST_KEY);
    if (wishes === null || wishes === "") return;
    // 지난번 옮기기가 아직 안 끝났으면 덮어쓰지 않는다 — 덮어쓰면 그 찜을 잃는다.
    if (storage.getItem(WISH_CARRY_KEY) !== null) return;
    storage.setItem(WISH_CARRY_KEY, wishes);
    storage.removeItem(WISHLIST_KEY);
  } catch {
    // 저장소를 못 쓰면 옮길 방법이 없다. 기기 찜은 그대로 두고 넘어간다.
  }
}

/** 보관함에 담긴 상품 번호. 해석할 수 없는 항목은 건너뛴다. */
export function readCarriedWishes(storage: Storage): number[] {
  let raw: string | null;
  try {
    raw = storage.getItem(WISH_CARRY_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const goodsNos: number[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const { product } = item as { product?: unknown };
    if (typeof product !== "object" || product === null) continue;
    const { goodsNo } = product as { goodsNo?: unknown };
    if (typeof goodsNo === "number" && Number.isFinite(goodsNo)) goodsNos.push(goodsNo);
  }
  return goodsNos;
}

/**
 * 아직 못 옮긴 것만 남긴다. 남은 것이 없으면 보관함을 지운다.
 * 성공한 것만 빠지므로 다음 접속에 이어서 시도할 수 있다.
 */
export function clearCarriedWishes(storage: Storage, remaining: number[]): void {
  try {
    if (remaining.length === 0) {
      storage.removeItem(WISH_CARRY_KEY);
      return;
    }
    storage.setItem(
      WISH_CARRY_KEY,
      JSON.stringify(remaining.map((goodsNo) => ({ product: { goodsNo } }))),
    );
  } catch {
    // 못 지우면 다음 접속에 중복으로 올라간다 — 서버가 중복을 무시하므로 안전하다
  }
}
