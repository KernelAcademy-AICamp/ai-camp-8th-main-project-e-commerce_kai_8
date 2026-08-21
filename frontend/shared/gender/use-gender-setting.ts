"use client";

import { useSyncExternalStore } from "react";

import { isSignedInNow } from "@/shared/supabase/session-state";

import {
  getSyncServerStatus,
  getSyncStatus,
  subscribeSync,
} from "./gender-account-sync";
import {
  type GenderSetting,
  getGenderServerSnapshot,
  getGenderSnapshot,
  subscribeGender,
} from "./gender-setting";

/**
 * 이 기기의 성별 설정. 고르기 전에는 `null`(미확정)이다.
 *
 * 서버 스냅숏이 항상 미확정이라, 서버가 그린 화면과 첫 클라이언트 렌더가 어긋나지 않는다.
 */
export function useGenderSetting(): GenderSetting {
  return useSyncExternalStore(
    subscribeGender,
    getGenderSnapshot,
    getGenderServerSnapshot,
  );
}

/**
 * 게이트가 보는 세 상태.
 *
 * - `pending` — **아직 모른다.** 로그인 사용자의 계정 조회가 끝나기 전이다. 이때 묻지
 *   않는 것이 중요하다 — 계정에 값이 있는 사람에게 새 기기에서 다시 묻게 되기 때문이다.
 *   요청도 내보내지 않는다.
 * - `ask` — 어디에도 값이 없다. 선택 화면을 띄운다.
 * - `ready` — 값이 정해졌다. 요청을 내보내도 된다.
 */
export type GenderGateState = "pending" | "ask" | "ready";

export function useGenderGateState(): GenderGateState {
  const setting = useGenderSetting();
  const sync = useSyncExternalStore(subscribeSync, getSyncStatus, getSyncServerStatus);
  if (setting !== null) return "ready";
  // 비회원은 기다릴 것이 없다 — 계정에 값이 있을 수 없다(O-37).
  if (isSignedInNow() && sync !== "settled") return "pending";
  return "ask";
}

/** 성별이 정해졌는가 — 요청을 내보내도 되는가와 같은 뜻이다. */
export function useGenderReady(): boolean {
  return useGenderGateState() === "ready";
}
