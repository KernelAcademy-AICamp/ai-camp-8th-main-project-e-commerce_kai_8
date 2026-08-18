"use client";

import { useEffect } from "react";

import { useSignedIn } from "@/shared/supabase/use-signed-in";

import { fetchAccountProfile, saveAccountProfile } from "./account-profile-api";
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
    const sync = createProfileSync({
      isSignedIn: () => alive,
      read: readLongTerm,
      upload: saveAccountProfile,
    });

    // 읽기에 실패하면 이번 세션은 기기에 있는 것으로 동작하되, 그 상태를
    // 서버에 덮어쓰지 않는다 — 실패를 빈 프로필로 오인해 계정 취향을 날리면
    // 안 된다.
    let loaded = false;
    void fetchAccountProfile().then(
      (profile) => {
        if (!alive) return;
        installLongTermFromServer(profile);
        loaded = true;
      },
      () => {
        // 다음 로그인에 다시 읽는다
      },
    );

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
