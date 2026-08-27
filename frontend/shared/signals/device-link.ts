// 이 기기를 로그인한 계정과 잇는다 — 서버 호출. 정본: O-43 (2026-08-27)
//
// 왜 필요한가 — 지표가 기기 단위라 같은 사람이 기기를 바꾸거나 시크릿 창을 쓰면
// 다른 사람으로 세어졌다. 실측으로 온보딩 완료가 하루 68건이었는데 그날 실제
// 신규 가입은 0건이었다(2026-08-26).
//
// **인증 통로로 부른다.** 익명 통로(`shared/supabase-rpc.ts`)는 공개 키만 실어
// 보내므로 서버가 누구인지 모른다. 계정을 인자로 보내는 방법도 있지만 그러면
// **남의 계정에 기기를 붙일 수 있다** — 서버가 토큰에서 직접 읽어야 한다.
//
// **행동 이벤트에는 계정 식별자를 넣지 않는다.** 이벤트 통로는 페이지를 떠나는
// 중에도 보내야 해서(keepalive) 토큰을 실을 수 없다. 그래서 쌍만 따로 잇고,
// 어드민이 집계할 때 이어 붙인다.

import { authedRpc } from "@/shared/supabase/authed-rpc";

import { getDeviceId } from "./device-id";

/** 이 페이지 수명 동안 이미 이었는지. 앱 시작마다 한 번이면 충분하다. */
let linked = false;

/**
 * 이 기기를 지금 로그인한 계정과 잇는다.
 *
 * **실패는 조용히 넘어간다.** 세는 일이 사용자의 진행을 막아서는 안 된다.
 * 다음 앱 시작에서 다시 시도된다.
 */
export async function linkDeviceToAccount(): Promise<void> {
  if (linked || typeof window === "undefined") return;
  // 실패해도 이번 페이지에서는 다시 시도하지 않는다 — 실패가 잦은 상황(네트워크
  // 단절)에서 앱 시작마다 여러 번 두드리는 것을 막는다.
  linked = true;
  try {
    await authedRpc<number>("c_link_device_account", { p_device: getDeviceId() });
  } catch {
    // 삼킨다 — 위 머리말 참고
  }
}

/** 테스트용 — 모듈 상태를 처음으로 되돌린다. */
export function resetDeviceLink(): void {
  linked = false;
}
