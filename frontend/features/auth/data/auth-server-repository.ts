// 서버 쪽 계정 동작 — 콜백 라우트가 쓴다.
// 라우트는 요청/응답 변환만 하고, 교환과 확인은 여기가 맡는다(설계 §2 콜백 책임).

import { type AuthUser, googleProviderId } from "../domain/auth-session";
import { createServerSupabase } from "./server-client";

/** 인가 코드를 세션으로 바꾸고 쿠키에 심는다. 성공 여부만 돌려준다. */
export async function exchangeCodeForSession(code: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error === null;
}

/** 인증 서버에 물어 확인한 사용자 (서버 판정용). */
export async function fetchVerifiedUserOnServer(): Promise<AuthUser | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error !== null) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    providerId: googleProviderId(data.user.identities),
  };
}
