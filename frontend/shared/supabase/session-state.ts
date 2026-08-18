// 로그인 여부의 **공유 상태**.
//
// React 밖(신호 기록·프로필 저장)에서도 동기로 읽어야 해서 모듈 저장소로 둔다.
// 화면은 use-signed-in 훅으로 같은 값을 구독한다 — 구독을 화면마다 새로 만들면
// 같은 질문에 서로 다른 답이 나올 수 있다.
//
// **판정 전에는 "아니다"로 본다.** 로그인하지 않은 사람의 행동을 기록하지 않기로
// 했으므로(2026-08-19 결정), 확실해지기 전에 기록하는 쪽보다 몇 건 놓치는 쪽이
// 약속에 맞다.

import type { SupabaseClient } from "@supabase/supabase-js";

import { getBrowserSupabase } from "@/shared/supabase/browser-client";

export type SignedInState = "unknown" | "in" | "out";

let state: SignedInState = "unknown";
let started = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

function apply(next: SignedInState): void {
  if (state === next) return;
  state = next;
  notify();
}

/** 브라우저에서 한 번만 구독을 건다. 서버 렌더에서는 아무것도 하지 않는다. */
function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  let supabase: SupabaseClient;
  try {
    supabase = getBrowserSupabase();
  } catch {
    // 접속 설정이 없으면 세션을 알 수 없다. **모르면 기록하지 않는다** —
    // 판정 불가를 "로그인함"으로 보면 약속이 깨진다.
    apply("out");
    return;
  }

  function refresh(): void {
    void supabase.auth.getSession().then(
      ({ data }) => {
        apply(data.session === null ? "out" : "in");
      },
      () => {
        apply("out");
      },
    );
  }

  refresh();
  // 같은 브라우저의 다른 탭에서 일어난 변화도 여기로 전달된다
  supabase.auth.onAuthStateChange(() => {
    refresh();
  });
}

export function subscribeSession(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSignedInSnapshot(): SignedInState {
  start();
  return state;
}

/** 서버 렌더에는 세션이 없다 */
export function getSignedInServerSnapshot(): SignedInState {
  return "unknown";
}

/**
 * 지금 로그인한 상태인가 — React 밖에서 쓰는 동기 조회.
 *
 * **권한 판정에 쓰지 않는다.** 저장된 세션을 읽을 뿐이고 실제 허용 여부는
 * 서버가 정한다. 여기서는 "기록할 것인가"를 가르는 데만 쓴다.
 */
export function isSignedInNow(): boolean {
  return getSignedInSnapshot() === "in";
}
