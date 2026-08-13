"use client";

import { useCallback, useEffect, useState } from "react";

import type { Product } from "@/features/feed/domain/product";

export interface OriginRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface DetailState {
  product: Product;
  originRect: OriginRect | null;
  phase: "open" | "closing";
}

/**
 * 상세 화면 열림/닫힘 상태.
 * 열 때 히스토리를 한 칸 쌓아 브라우저 뒤로가기로도 닫히게 한다.
 * 닫기는 항상 history.back() → popstate → "closing" → 전환 애니메이션 뒤 finishClose 순서.
 */
export function useDetailState() {
  const [detail, setDetail] = useState<DetailState | null>(null);

  const open = useCallback((product: Product, originRect: OriginRect | null) => {
    setDetail({ product, originRect, phase: "open" });
    window.history.pushState({ eatiDetail: true }, "");
  }, []);

  const requestClose = useCallback(() => {
    window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setDetail((prev) => (prev ? { ...prev, phase: "closing" } : prev));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const finishClose = useCallback(() => {
    setDetail(null);
  }, []);

  return { detail, open, requestClose, finishClose };
}
