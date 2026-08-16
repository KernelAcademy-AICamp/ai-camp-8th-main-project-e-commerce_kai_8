"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import {
  dismissConsentNotice,
  isConsentNoticeVisible,
  subscribeConsentNotice,
} from "@/shared/consent-notice-store";

/**
 * 최초 방문 1회 개인화 고지 배너 (PRD P0).
 * 확인하면 다시 보이지 않고, 자세한 내용·초기화는 /settings에 있다.
 * 표시 여부는 shared 저장소로 공유한다 — 플로팅 검색창이 겹침을 피해
 * 위로 물러날 수 있게 (검색 설계 §3).
 */
export function ConsentNotice() {
  // SSR에서는 안 보이고(서버 스냅샷 false), 클라이언트에서 저장소를 읽어 결정한다
  const visible = useSyncExternalStore(
    subscribeConsentNotice,
    isConsentNoticeVisible,
    () => false,
  );
  // 저장 불가 환경에서도 이번 세션은 닫히도록 로컬 상태를 함께 둔다
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  const dismiss = () => {
    dismissConsentNotice();
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
