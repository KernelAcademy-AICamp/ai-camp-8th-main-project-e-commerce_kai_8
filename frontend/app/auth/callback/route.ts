// 구글 로그인 콜백 — 프레임워크 어댑터.
// 요청/응답 변환과 이동만 하고, 코드 교환·확인은 features/auth/data가 맡는다
// (frontend/AGENTS.md: app/은 라우팅·조립 전용).

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  exchangeCodeForSession,
  fetchVerifiedUserOnServer,
} from "@/features/auth/data/auth-server-repository";
import { readCallbackParams } from "@/features/auth/domain/auth-session";
import {
  AFTER_LOGIN_COOKIE,
  resolveAfterLoginPath,
} from "@/shared/history/after-login-path";

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const params = readCallbackParams(requestUrl.searchParams);

  // Supabase 세션 쿠키도 이 저장소(next/headers)로 쓴다(server-client.ts) — 같은
  // 통로로 읽고 지워야 응답을 만들 때 두 곳의 쿠키 변경이 한 응답에 함께 실린다.
  // NextResponse 자체의 쿠키 API를 섞어 쓰면 어느 한쪽이 응답에 안 실릴 수 있다.
  const cookieStore = await cookies();
  const savedPath = resolveAfterLoginPath(cookieStore.get(AFTER_LOGIN_COOKIE)?.value);
  cookieStore.delete(AFTER_LOGIN_COOKIE);

  // 동의 화면에서 취소 — 오류 문구 없이 돌아갈 자리(없으면 프로필)로 조용히 돌아간다
  if (params.kind === "cancelled") {
    return NextResponse.redirect(new URL(savedPath ?? "/my", requestUrl.origin));
  }

  if (params.kind === "failed") {
    // 실패 안내는 프로필 화면만 보여줄 줄 안다 — 돌아갈 자리가 있어도 거기엔 띄울 곳이 없다
    const landing = new URL("/my", requestUrl.origin);
    landing.searchParams.set("auth", "failed");
    return NextResponse.redirect(landing);
  }

  const exchanged = await exchangeCodeForSession(params.code);
  if (!exchanged) {
    // 인가 코드는 1회용이다. 새로고침·뒤로가기·동시 요청으로 이미 쓴 코드가 다시 와도
    // **이미 성립한 세션을 실패 화면으로 덮지 않는다** (설계 §3 경계 조건).
    const user = await fetchVerifiedUserOnServer();
    if (user === null) {
      const landing = new URL("/my", requestUrl.origin);
      landing.searchParams.set("auth", "failed");
      return NextResponse.redirect(landing);
    }
  }

  return NextResponse.redirect(new URL(savedPath ?? "/my", requestUrl.origin));
}
