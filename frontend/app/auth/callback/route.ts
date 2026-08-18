// 구글 로그인 콜백 — 프레임워크 어댑터.
// 요청/응답 변환과 이동만 하고, 코드 교환·확인은 features/auth/data가 맡는다
// (frontend/AGENTS.md: app/은 라우팅·조립 전용).

import { NextResponse } from "next/server";

import {
  exchangeCodeForSession,
  fetchVerifiedUserOnServer,
} from "@/features/auth/data/auth-server-repository";
import { readCallbackParams } from "@/features/auth/domain/auth-session";

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const params = readCallbackParams(requestUrl.searchParams);
  const settings = new URL("/settings", requestUrl.origin);

  // 동의 화면에서 취소 — 오류 문구 없이 조용히 돌아간다
  if (params.kind === "cancelled") {
    return NextResponse.redirect(settings);
  }

  if (params.kind === "failed") {
    settings.searchParams.set("auth", "failed");
    return NextResponse.redirect(settings);
  }

  const exchanged = await exchangeCodeForSession(params.code);
  if (!exchanged) {
    // 인가 코드는 1회용이다. 새로고침·뒤로가기·동시 요청으로 이미 쓴 코드가 다시 와도
    // **이미 성립한 세션을 실패 화면으로 덮지 않는다** (설계 §3 경계 조건).
    const user = await fetchVerifiedUserOnServer();
    if (user === null) {
      settings.searchParams.set("auth", "failed");
    }
  }

  return NextResponse.redirect(settings);
}
