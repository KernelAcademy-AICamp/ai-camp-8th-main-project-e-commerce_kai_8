"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  clearPendingDeletion,
  parsePendingDeletion,
  PENDING_DELETION_KEY,
} from "@/features/auth/data/pending-deletion-store";
import type { AuthState } from "@/features/auth/domain/auth-session";
import { decideDeletionFollowUp } from "@/features/auth/domain/pending-deletion";

/** 화면이 사용자에게 알려야 하는 것 */
export type DeletionFollowUp =
  | { kind: "none" }
  /** 다른 구글 계정으로 로그인했다. 원래 계정으로 들어와야 마무리된다 */
  | { kind: "otherAccount" }
  /** 삭제가 서버에 닿지 않았다. 다시 지워야 한다 */
  | { kind: "retryNeeded" };

/**
 * 이 표식은 이 탭이 스스로 쓰고 지운다 — 밖에서 바뀌는 것을 구독할 필요가 없다.
 * 구독 자리를 비워 두면 스냅숏은 렌더마다 다시 읽힌다.
 */
function subscribe(): () => void {
  return () => undefined;
}

/** 원문 문자열을 스냅숏으로 쓴다 — 문자열은 값으로 비교되므로 안정적이다. */
function readRawMarker(): string | null {
  try {
    return localStorage.getItem(PENDING_DELETION_KEY);
  } catch {
    return null;
  }
}

/** 서버 렌더에는 저장소가 없다. 표식이 없는 것으로 본다. */
function serverSnapshot(): string | null {
  return null;
}

/**
 * 지난번 탈퇴가 끝났는지 판정한다 (설계 §4 응답 불명 뒤의 재시도).
 *
 * 판정 규칙은 순수 함수에 있다. 여기서는 저장소를 읽어 그 규칙에 넘기고,
 * 결정에 따라 표식을 정리하거나 화면에 알릴 것을 고르기만 한다.
 */
export function useDeletionFollowUp(state: AuthState): DeletionFollowUp {
  const raw = useSyncExternalStore(subscribe, readRawMarker, serverSnapshot);
  // 만료 판정 기준 시각을 **마운트할 때 한 번** 잡는다. 렌더마다 현재 시각을
  // 읽으면 같은 입력에 다른 결과가 나올 수 있다. 30일 경계를 재는 데 이 정도
  // 정밀도면 충분하다.
  const [now] = useState(() => Date.now());

  const decision = useMemo(() => {
    // 판정 전에는 아무것도 하지 않는다 — 로그인했는데 로그아웃으로 보고
    // "다른 계정" 안내를 잘못 띄우지 않기 위해서다.
    if (state.kind === "loading") return { kind: "none" } as const;

    const marker = raw === null ? null : parsePendingDeletion(raw);
    const current =
      state.kind === "signedIn" && state.user.providerId !== null
        ? { userId: state.user.id, providerId: state.user.providerId }
        : null;

    return decideDeletionFollowUp(marker, current, now);
  }, [state, raw, now]);

  useEffect(() => {
    if (decision.kind === "clearExpired" || decision.kind === "clearCompleted") {
      clearPendingDeletion(localStorage);
    }
  }, [decision]);

  if (decision.kind === "keepAndWarn") return { kind: "otherAccount" };
  if (decision.kind === "retry") return { kind: "retryNeeded" };
  // 정리 대상(만료·이미 완료)은 사용자에게 알릴 것이 없다.
  return { kind: "none" };
}
