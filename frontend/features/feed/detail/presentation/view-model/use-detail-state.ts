"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type DetailEntry,
  markTopClosing,
  type OriginRect,
  popDetail,
  pushDetail,
} from "@/features/feed/detail/domain/detail-stack";
import type { Product } from "@/features/feed/domain/product";
import { logAction } from "@/shared/signals/signals";

// 기존 소비처(product-card 등)의 import 경로 유지를 위한 재수출
export type { DetailEntry, OriginRect };

/**
 * 상세 화면 체인 스택 — 상세→탐색→상세로 무한히 파고들 수 있다.
 * 레벨을 열 때마다 히스토리를 한 칸 쌓아 브라우저 뒤로가기가 한 단계씩 닫게 한다.
 * 닫기는 항상 history.back() → popstate → "closing" → 전환 애니메이션 뒤 finishClose 순서.
 * 화면에는 최상단(top) 한 장만 렌더한다.
 */
export function useDetailState() {
  const [stack, setStack] = useState<DetailEntry[]>([]);

  const open = useCallback(
    (product: Product, originRect: OriginRect | null, currentScrollTop = 0) => {
      setStack((prev) => pushDetail(prev, product, originRect, currentScrollTop));
      window.history.pushState({ aTeeDetail: true }, "");
      // 상세 열기 = 탭 신호 — 모든 진입 경로(피드·상세 하단 탐색 체인)의 단일 지점
      logAction("tap", product.goodsNo);
    },
    [],
  );

  const requestClose = useCallback(() => {
    window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setStack((prev) => markTopClosing(prev));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const finishClose = useCallback(() => {
    setStack((prev) => popDetail(prev));
  }, []);

  const top = stack.length > 0 ? stack[stack.length - 1] : null;

  return { stack, top, depth: stack.length, open, requestClose, finishClose };
}
