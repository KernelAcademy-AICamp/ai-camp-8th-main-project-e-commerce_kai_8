"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { closeTarget } from "@/features/auth/domain/login-close";

/**
 * 화면의 닫기·뒤로가기 — 이 앱 안에서 왔으면 뒤로, 아니면 피드로.
 *
 * @param selfPath 이 화면 자신의 경로. 새로고침하면 참조 주소가 자기 자신이
 *   되는데, 그때 뒤로 가면 다시 여기라 피드로 보낸다.
 */
export function useScreenClose(selfPath: string): () => void {
  const router = useRouter();

  return useCallback(() => {
    const target = closeTarget(document.referrer, window.location.origin, selfPath);
    if (target === "back") router.back();
    else router.replace("/");
  }, [router, selfPath]);
}
