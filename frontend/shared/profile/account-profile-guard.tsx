"use client";

import { useEffect } from "react";

import { getCurrentUserId } from "@/shared/supabase/current-user";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

import { fetchAccountProfile, saveAccountProfile } from "./account-profile-api";
import { hasPendingTasteForget, retryPendingTasteForget } from "./pending-taste-forget";
import {
  installLongTermFromServer,
  readLongTerm,
  setLongTermChangeListener,
} from "./profile-store";
import { createProfileSync } from "./profile-sync";

/** 신호 큐와 같은 간격. 프로필도 같은 리듬으로 올린다. */
const FLUSH_INTERVAL_MS = 5_000;

/**
 * 취향 프로필을 계정에 맞춰 두는 감시자 — 화면을 그리지 않는다.
 *
 * 로그인하면 서버에서 읽어 기기에 놓고, 그 뒤 바뀔 때마다 표시해 두었다가
 * 일정 간격과 화면을 떠날 때 올린다(설계 §2).
 *
 * **매 행동마다 올리지 않는다.** 프로필은 노출 하나에도 바뀌므로 그때마다
 * 올리면 쓰기가 폭증한다 — 무료 플랜에서 먼저 무너지는 쪽이다.
 */
export function AccountProfileGuard() {
  const signedIn = useSignedIn();

  useEffect(() => {
    if (signedIn !== "in") return;

    let alive = true;
    // await 사이에 정리될 수 있다. 함수로 읽는다 — 지역 변수를 그대로 보면
    // 타입 검사기가 "항상 true"로 좁혀 두 번째 확인을 지워 버린다.
    const isAlive = () => alive;
    const sync = createProfileSync({
      isSignedIn: isAlive,
      read: readLongTerm,
      upload: saveAccountProfile,
    });

    // 읽기에 실패하면 이번 세션은 기기에 있는 것으로 동작하되, 그 상태를
    // 서버에 덮어쓰지 않는다 — 실패를 빈 프로필로 오인해 계정 취향을 날리면
    // 안 된다.
    let loaded = false;

    /**
     * **밀린 삭제를 먼저 처리하고 읽는다.** 순서가 바뀌면 지우려던 취향을
     * 그대로 기기에 내려놓고, 그 다음 삭제가 성공해도 화면에는 옛 취향이
     * 남는다 (방침 O-32 삭제 계약).
     *
     * 밀린 것이 없으면 저장소만 한 번 읽고 곧바로 넘어간다 — 정상 접속에
     * 왕복을 더하지 않는다.
     */
    async function forgetThenLoad(): Promise<void> {
      if (hasPendingTasteForget()) {
        const userId = await getCurrentUserId();
        if (userId !== null) await retryPendingTasteForget(userId);
      }
      if (!isAlive()) return;
      const profile = await fetchAccountProfile();
      if (!isAlive()) return;
      installLongTermFromServer(profile);
      loaded = true;
    }

    void forgetThenLoad().catch(() => {
      // 다음 로그인에 다시 읽는다. 삭제도 큐에 남아 다시 시도된다.
    });

    setLongTermChangeListener(() => {
      if (loaded) sync.markDirty();
    });

    const timer = setInterval(() => {
      void sync.flush();
    }, FLUSH_INTERVAL_MS);

    function flushNow(): void {
      void sync.flush();
    }
    window.addEventListener("pagehide", flushNow);

    return () => {
      alive = false;
      setLongTermChangeListener(null);
      clearInterval(timer);
      window.removeEventListener("pagehide", flushNow);
    };
  }, [signedIn]);

  return null;
}
