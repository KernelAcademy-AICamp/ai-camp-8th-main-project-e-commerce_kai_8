// 브라우저 쪽 계정 동작 — 화면은 이 함수들만 쓴다.
// Supabase 클라이언트 자체를 밖으로 내보내지 않는다(설계 §2 transport 경계).

import type { User } from "@supabase/supabase-js";

import type { AuthUser } from "../domain/auth-session";
import { getBrowserSupabase } from "./browser-client";

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email ?? null };
}

/**
 * 구글 로그인을 시작한다 — 구글 동의 화면으로 이동하므로 정상 흐름에서는 돌아오지 않는다.
 * callbackUrl은 Supabase의 허용 목록에 정확히 등록된 주소여야 한다(설계 §3).
 */
export async function startGoogleSignIn(callbackUrl: string): Promise<void> {
  const { error } = await getBrowserSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl },
  });
  if (error !== null) throw new Error(error.message);
}

/**
 * 이 기기만 로그아웃한다.
 * Supabase 기본값(global)은 **다른 기기의 세션까지 끊는다** — 보통 기대와 다르므로
 * local을 명시한다(설계 §2 로그아웃 범위).
 */
export async function signOutThisDevice(): Promise<void> {
  const { error } = await getBrowserSupabase().auth.signOut({ scope: "local" });
  if (error !== null) throw new Error(error.message);
}

/**
 * 인증 서버에 실제로 물어 확인한 사용자.
 * 저장된 세션 값을 그대로 믿는 조회를 권한 판정에 쓰지 않는다(설계 §2).
 */
export async function fetchVerifiedUser(): Promise<AuthUser | null> {
  const { data, error } = await getBrowserSupabase().auth.getUser();
  if (error !== null) return null;
  return toAuthUser(data.user);
}

/**
 * 저장된 세션의 사용자 식별자 (네트워크 호출 없음).
 *
 * 권한 판정에는 쓰지 않는다 — 그건 fetchVerifiedUser의 몫이다.
 * 신원 전환 감지는 "이 브라우저의 신원이 바뀌었는가"라는 로컬 질문이므로
 * 빠른 로컬 조회가 맞다. 여기서 네트워크를 타면 전환 처리가 늦어져
 * 앞 신원의 화면이 더 오래 남는다.
 */
export async function fetchLocalUserId(): Promise<string | null> {
  const { data } = await getBrowserSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * 로그인 상태 변화를 구독한다.
 * Supabase 클라이언트가 같은 브라우저의 다른 탭 변화도 전달한다.
 */
export function subscribeAuthChange(listener: () => void): () => void {
  const { data } = getBrowserSupabase().auth.onAuthStateChange(() => {
    listener();
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
