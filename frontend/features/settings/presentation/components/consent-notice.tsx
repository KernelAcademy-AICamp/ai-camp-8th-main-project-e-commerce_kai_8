"use client";

import Link from "next/link";

import { useConsentNotice } from "@/features/settings/presentation/view-model/use-consent-notice";

/**
 * 최초 방문 1회 개인화 고지 배너 (PRD P0).
 * 확인하면 다시 보이지 않고, 자세한 내용·초기화는 /settings에 있다.
 * 표시 여부는 shared 저장소로 공유한다 — 플로팅 검색창이 겹침을 피해
 * 위로 물러날 수 있게 (검색 설계 §3).
 */
export function ConsentNotice() {
  const { visible, dismiss } = useConsentNotice();

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md p-3">
      <div className="rounded-2xl bg-neutral-800/95 p-4 text-sm text-neutral-200 shadow-lg backdrop-blur">
        <p>
          aTee는 취향에 맞는 피드를 위해 익명 ID로 탐색 행동(노출·탭·찜 등)을 기록해요.
          검색어도 검색 품질 개선을 위해 기록되고 90일 뒤 지워져요. 로그인은 선택이고,
          하면 이메일 주소와 찜한 상품, 취향을 계정에 저장해요. 언제든 지울 수 있어요.
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
