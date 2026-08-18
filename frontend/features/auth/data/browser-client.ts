// 브라우저에서 쓰는 Supabase 인증 접근. 세션은 쿠키에 둔다(설계 §2).
//
// 이 클라이언트를 feature 전역에 내보내지 않는다 — 계정용 동작은
// auth-repository의 이름 붙은 함수로만 노출한다(설계 §2 transport 경계).

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readSupabaseConfig } from "./supabase-config";

let cached: SupabaseClient | null = null;

/** 탭 하나당 인스턴스 하나 — 여러 개면 세션 구독이 중복된다 */
export function getBrowserSupabase(): SupabaseClient {
  if (cached === null) {
    const { url, key } = readSupabaseConfig();
    cached = createBrowserClient(url, key);
  }
  return cached;
}
