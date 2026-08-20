// 세션 갱신 계층 (Next 16에서 middleware의 새 이름).
//
// 서버 컴포넌트는 쿠키를 쓸 수 없으므로 만료 직전 토큰을 여기서 갱신한다(설계 §2).
// 적용 범위는 계정이 관여하는 경로로 한정한다 — 피드·검색 응답에 인증 처리를
// 얹지 않기 위함이다.
//
// **여기는 권한을 판정하는 곳이 아니다.** 통과·차단을 정하지 않고 토큰만 손본다.
// 누구인지는 화면(fetchVerifiedUser)과 데이터베이스 규칙(RLS)이 인증 서버에 물어
// 확인한다. 그래서 이 계층은 갱신만 하면 되고, 확인까지 할 필요가 없다.

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { readSupabaseConfig } from "@/shared/supabase/config";

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { url, key } = readSupabaseConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    // 갱신이 필요할 때만 네트워크로 나간다.
    //
    // 전에는 `getUser()`를 불렀다. 그건 **갱신 + 인증 서버에 확인**이고, 확인
    // 쪽이 이동할 때마다 왕복을 만들었다 — 서울에서 잰 값으로 약 0.28초
    // (docs/plans/2026-08-20-my-page-navigation-latency.md).
    //
    // `getSession()`은 그 둘 중 **갱신만** 한다. 쿠키를 로컬에서 읽고, 만료가
    // 90초 안으로 들어왔을 때만 갱신 요청을 보낸다(auth-js의 EXPIRY_MARGIN_MS =
    // AUTO_REFRESH_TICK_THRESHOLD 3 × TICK 30초. 확인함: GoTrueClient의
    // `__loadSession`). 즉 대부분의 이동에서 네트워크가 아예 없고, 만료가
    // 가까우면 예전과 똑같이 갱신되어 새 쿠키가 응답에 실린다.
    //
    // **세션의 사용자 정보는 읽지 않는다.** 저장된 값이라 권한 판정에 쓸 수 없고
    // (설계 §2), 이 계층은 애초에 판정을 하지 않는다.
    const { error } = await supabase.auth.getSession();
    if (error !== null) throw new Error(error.message);
  } catch {
    // 쿠키를 못 읽었거나 형태가 다르다 — 예전 방식으로 인증 서버에 맡긴다.
    // 여기서 조용히 넘어가면 갱신 없이 만료된 세션이 그대로 통과한다.
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  matcher: ["/my/:path*", "/settings/:path*", "/auth/:path*"],
};
