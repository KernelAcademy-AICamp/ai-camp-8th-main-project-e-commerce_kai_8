"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 이만큼 보이다가 스스로 사라진다 */
const DURATION_MS = 2000;

/**
 * 바닥에 잠깐 떴다 사라지는 한 줄 안내 — "담았어요" 같은 성사 확인용
 * (2026-08-25). 되돌릴 수 있는 일에 쓴다 — 실패·확인이 필요한 일은 이 자리가
 * 아니라 `shared/ui/popup.tsx`를 쓴다.
 */
export function useSnackbar() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setMessage(text);
    timerRef.current = setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return { message, show };
}
