// 미완료 취향 삭제 큐 (방침 O-32 삭제 계약).
//
// 기기 기록 쪽(`shared/signals/pending-forget.ts`)과 **같은 규칙**을 쓴다:
// 실패한 것을 적어 두고, 다음 접속에 다시 시도하고, **성공한 것만 뺀다.**
// 목록 규칙(중복 없이 더하기·상한 없음)도 같은 순수 함수를 공유한다.
//
// 목록을 나눈 이유: 기기 삭제는 익명 통로로 누구나 재시도할 수 있지만, 취향
// 삭제는 **그 계정으로 로그인해 있어야** 부를 수 있다. 한 목록에 섞으면 기기
// ID를 계정으로, 계정을 기기 ID로 재시도하게 된다.
//
// ⚠️ **온보딩 선택 삭제도 별도 목록이다**(shared/onboarding/pending-onboarding-forget.ts).
// 조건이 같다고 한 목록에 담으면 **부분 성공을 표현하지 못한다** — 여기만 성공하고
// 저쪽이 실패했을 때, 재시도가 이미 지운 취향부터 다시 지워 그 사이에 새로 쌓인
// 취향까지 없앤다(교차 리뷰 ③).
//
// ⚠️ 왜 사용자 식별자를 적어 두는가: 서버 함수는 호출자의 인증 주체만 지운다.
// 그래서 A의 삭제가 밀린 채 B가 로그인한 상태에서 재시도하면 **B의 취향이
// 지워진다.** 적어 둔 식별자와 지금 로그인한 사람이 같을 때만 부른다.

import { nextPendingForgetList } from "@/shared/signals/pending-forget-list";

import { forgetAccountProfile } from "./account-profile-api";

const STORAGE_KEY = "atee-pending-taste-forget";

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function write(userIds: string[]): void {
  try {
    // 상한을 두지 않는다 — 잘라내면 그 계정의 서버 취향을 영원히 못 지운다.
    // 이유는 pending-forget-list.ts 참고.
    if (userIds.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(userIds));
  } catch {
    // 저장 불가 환경이면 이번 세션에서만 재시도할 수 있다 — 그 이상은 방법이 없다
  }
}

/** 서버 삭제에 실패한 계정을 적어 둔다 (중복은 넣지 않는다) */
export function rememberPendingTasteForget(userId: string): void {
  write(nextPendingForgetList(read(), userId));
}

/** 아직 서버에서 지우지 못한 취향이 있는가 */
export function hasPendingTasteForget(): boolean {
  return read().length > 0;
}

/**
 * 지금 로그인한 사람의 미완료 취향 삭제를 다시 시도한다.
 *
 * **다른 사람 몫은 건드리지 않고 목록에 남긴다** — 그 사람이 다시 로그인할 때
 * 지운다. 실패해도 조용히 넘어가고 다음 접속에 다시 시도한다.
 *
 * @returns 이번에 실제로 지웠는가 (호출부가 이어서 읽을지 가른다)
 */
export async function retryPendingTasteForget(currentUserId: string): Promise<boolean> {
  const pending = read();
  if (!pending.includes(currentUserId)) return false;

  try {
    await forgetAccountProfile();
  } catch {
    return false; // 다음 접속에 다시 시도한다
  }
  write(pending.filter((id) => id !== currentUserId));
  return true;
}
