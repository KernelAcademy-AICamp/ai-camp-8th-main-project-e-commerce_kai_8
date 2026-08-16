"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "atee-consent-notice-seen";

const noopSubscribe = () => () => {
  // 저장소 변경 구독 불필요 — 닫기는 setDismissed가 리렌더한다
};

function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // 저장 불가 환경 — 고지를 반복 노출하지 않기 위해 본 것으로 취급
    return true;
  }
}

/**
 * 최초 방문 1회 개인화 고지 배너 (PRD P0).
 * 확인하면 다시 보이지 않고, 자세한 내용·초기화는 /settings에 있다.
 */
export function ConsentNotice() {
  // SSR에서는 안 보이고(서버 스냅샷 true), 클라이언트에서 저장소를 읽어 결정한다
  const seen = useSyncExternalStore(noopSubscribe, readSeen, () => true);
  const [dismissed, setDismissed] = useState(false);

  if (seen || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 저장 불가 시 이번 세션만 닫힘
    }
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md p-3">
      <div className="rounded-2xl bg-neutral-800/95 p-4 text-sm text-neutral-200 shadow-lg backdrop-blur">
        <p>
          aTee는 취향에 맞는 피드를 위해 익명 ID로 탐색 행동(노출·탭·찜 등)을 기록해요.
          개인정보는 수집하지 않아요.
        </p>
        <div className="mt-3 flex items-center justify-end gap-4">
          <Link
            href="/settings"
            className="text-neutral-400 underline"
            onClick={dismiss}
          >
            자세히·초기화
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="cursor-pointer rounded-lg bg-white px-4 py-1.5 font-medium text-black"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
