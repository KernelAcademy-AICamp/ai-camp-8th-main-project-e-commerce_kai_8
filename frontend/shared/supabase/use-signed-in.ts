"use client";

import { useSyncExternalStore } from "react";

import {
  getSignedInServerSnapshot,
  getSignedInSnapshot,
  type SignedInState,
  subscribeSession,
} from "@/shared/supabase/session-state";

export type { SignedInState };

/**
 * 로그인 여부만 알려준다.
 *
 * 판정 전(`unknown`)을 따로 두는 이유: 로그아웃 화면을 먼저 그렸다가 로그인
 * 화면으로 튀는 깜빡임을 막기 위해서다.
 *
 * 값의 출처는 `session-state` 하나다 — 화면마다 구독을 새로 만들면 같은 질문에
 * 서로 다른 답이 나올 수 있다.
 */
export function useSignedIn(): SignedInState {
  return useSyncExternalStore(
    subscribeSession,
    getSignedInSnapshot,
    getSignedInServerSnapshot,
  );
}
