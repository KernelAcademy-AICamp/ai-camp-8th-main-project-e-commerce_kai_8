// 지금 로그인한 사용자의 식별자.
//
// `session-state.ts`는 "로그인했는가"만 동기로 들고 있다. 여기서 필요한 것은
// **누구인가**다 — 계정에 매인 삭제를 미뤘다가 다시 시도할 때, 그 사이 다른
// 사람이 로그인했으면 **그 사람 것을 지우게 되기 때문**이다.
//
// Supabase 클라이언트 자체를 밖으로 내보내지 않는다(설계 §2 transport 경계).

import { getBrowserSupabase } from "@/shared/supabase/browser-client";

/** 로그인하지 않았거나 세션을 읽지 못하면 null */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await getBrowserSupabase().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    // 접속 설정이 없거나 세션을 읽지 못하는 환경 — 누구인지 모른다
    return null;
  }
}
