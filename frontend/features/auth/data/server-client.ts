// 서버(라우트 핸들러)에서 쓰는 Supabase 인증 접근.
// 쿠키 읽기·쓰기를 Next의 쿠키 저장소에 연결한다(설계 §2 쿠키 세션).

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { readSupabaseConfig } from "@/shared/supabase/config";

export async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { url, key } = readSupabaseConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 그 경우 갱신은 proxy가 담당한다.
        }
      },
    },
  });
}
