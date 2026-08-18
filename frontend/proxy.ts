// 세션 갱신 계층 (Next 16에서 middleware의 새 이름).
//
// 서버 컴포넌트는 쿠키를 쓸 수 없으므로 만료 직전 토큰을 여기서 갱신한다(설계 §2).
// 적용 범위는 계정이 관여하는 경로로 한정한다 — 피드·검색 응답에 인증 처리를
// 얹지 않기 위함이다.

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { readSupabaseConfig } from "@/features/auth/data/supabase-config";

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

  // 이 호출이 있어야 만료된 토큰이 갱신되고 새 쿠키가 응답에 실린다
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/settings/:path*", "/auth/:path*"],
};
