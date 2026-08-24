// 미완료 **온보딩 선택** 삭제 큐 (방침 O-32 삭제 계약).
//
// `shared/profile/pending-taste-forget.ts`와 같은 규칙·같은 순수 함수를 쓴다.
//
// ⚠️ **왜 취향 큐와 나누는가.** 처음에는 "지우는 조건이 같으니 한 큐를 쓰자"고 했는데
// 틀렸다. 한 큐는 **부분 성공을 표현하지 못한다** — 취향 삭제는 성공하고 온보딩 삭제만
// 실패해도 사용자 ID 하나만 남는다. 그 뒤 사람이 새로 탐색해 취향이 다시 쌓인 다음
// 재시도가 돌면 **이미 성공했던 취향 삭제부터 다시 불러 초기화 이후의 새 취향까지
// 지운다.** 멱등은 "사이에 새 데이터가 안 생겼을 때"만 안전하다(교차 리뷰 ③).
//
// ⚠️ 왜 사용자 식별자를 적어 두는가: 서버 함수는 호출자의 인증 주체만 지운다.
// A의 삭제가 밀린 채 B가 로그인한 상태에서 재시도하면 **B의 것이 지워진다.**

import { nextPendingForgetList } from "@/shared/signals/pending-forget-list";

import { forgetAccountOnboarding } from "./account-onboarding-api";

/**
 * 신원 전환에도 살아남아야 한다 — 로그아웃하면 정리가 곧바로 도는데 여기서 같이
 * 지우면 **다시 로그인해도 서버에 남은 선택을 지울 수 없다.**
 * 지키는 쪽은 identity-scoped-keys.ts의 남길 목록이다.
 */
export const PENDING_ONBOARDING_FORGET_KEY = "atee-pending-onboarding-forget";

function read(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_ONBOARDING_FORGET_KEY);
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
    // 상한을 두지 않는다 — 잘라내면 그 계정의 서버 선택을 영원히 못 지운다.
    if (userIds.length === 0) localStorage.removeItem(PENDING_ONBOARDING_FORGET_KEY);
    else localStorage.setItem(PENDING_ONBOARDING_FORGET_KEY, JSON.stringify(userIds));
  } catch {
    // 저장 불가 환경이면 이번 세션에서만 재시도할 수 있다 — 그 이상은 방법이 없다
  }
}

/** 서버 삭제에 실패한 계정을 적어 둔다 (중복은 넣지 않는다) */
export function rememberPendingOnboardingForget(userId: string): void {
  write(nextPendingForgetList(read(), userId));
}

/** 아직 서버에서 지우지 못한 온보딩 선택이 있는가 */
export function hasPendingOnboardingForget(): boolean {
  return read().length > 0;
}

/**
 * 지금 로그인한 사람의 미완료 온보딩 선택 삭제를 다시 시도한다.
 *
 * **다른 사람 몫은 건드리지 않고 목록에 남긴다.** 실패해도 조용히 넘어가고 다음
 * 접속에 다시 시도한다.
 *
 * @returns 이번에 실제로 지웠는가
 */
export async function retryPendingOnboardingForget(
  currentUserId: string,
): Promise<boolean> {
  const pending = read();
  if (!pending.includes(currentUserId)) return false;

  try {
    await forgetAccountOnboarding();
  } catch {
    return false; // 다음 접속에 다시 시도한다
  }
  write(pending.filter((id) => id !== currentUserId));
  return true;
}
