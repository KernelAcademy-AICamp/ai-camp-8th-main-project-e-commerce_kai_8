"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type DetailMark,
  readDetailMark,
  reconcileToMark,
  restoredStack,
  withDetailMark,
} from "@/features/feed/detail/domain/detail-history";
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
 *
 * **진실은 히스토리 항목에 있다.** 각 항목이 자기 자리에서 어떤 상세가 몇 번째로
 * 열려 있어야 하는지를 지니고, 뒤로·앞으로 이동이 생기면 화면을 그 항목에 맞춘다.
 * 화면 쪽 기억만 믿던 예전에는 앞으로가기가 삼켜지고 고아 항목이 남았다
 * (`detail-history.ts` 머리말).
 *
 * @param owner 이 상세를 여는 화면. 홈은 BROWSE와 FOR YOU가 하나의 히스토리를
 *   함께 쓰므로, 이 값이 없으면 뒤로가기 한 번에 두 화면이 같이 움직인다.
 */
export function useDetailState(owner: string) {
  const [stack, setStack] = useState<DetailEntry[]>([]);
  /** 히스토리가 말하는 진짜 깊이. 스택은 아는 겹만 담아 이보다 얕을 수 있다. */
  const levelRef = useRef(0);
  /** 지금 서 있는 항목의 표식 — 되살린 겹을 닫을 때 그 아래를 그려야 한다. */
  const markRef = useRef<DetailMark | null>(null);

  const applyMark = useCallback((mark: DetailMark | null) => {
    const from = levelRef.current;
    levelRef.current = mark?.level ?? 0;
    markRef.current = mark;
    setStack((prev) => {
      const next = reconcileToMark(prev, from, mark);
      if (next.kind === "settle") return next.stack;
      if (next.kind === "closeTop") return markTopClosing(prev);
      return prev;
    });
  }, []);

  // 재기동·새로고침으로 화면 쪽 기억만 사라진 채 항목만 남은 자리에서 시작할 수 있다
  useEffect(() => {
    applyMark(readDetailMark(window.history.state, owner));
  }, [applyMark, owner]);

  const open = useCallback(
    (product: Product, originRect: OriginRect | null, currentScrollTop = 0) => {
      const mark: DetailMark = {
        owner,
        level: levelRef.current + 1,
        product,
      };
      levelRef.current = mark.level;
      markRef.current = mark;
      setStack((prev) => pushDetail(prev, product, originRect, currentScrollTop));
      window.history.pushState(withDetailMark(window.history.state, mark), "");
      // 상세 열기 = 탭 신호 — 모든 진입 경로(피드·상세 하단 탐색 체인)의 단일 지점.
      // 되살아난 겹은 여기를 지나지 않는다 — 새로 본 것이 아니다.
      logAction("tap", product.goodsNo, { gender: product.gender });
    },
    [owner],
  );

  const requestClose = useCallback(() => {
    window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      applyMark(readDetailMark(event.state, owner));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [applyMark, owner]);

  const finishClose = useCallback(() => {
    setStack((prev) => {
      const next = popDetail(prev);
      // 아는 겹을 다 걷었는데 히스토리가 아직 상세 안이라면, 그 겹을 되살린다
      if (next.length === 0 && levelRef.current > 0)
        return restoredStack(markRef.current);
      return next;
    });
  }, []);

  const top = stack.length > 0 ? stack[stack.length - 1] : null;

  return { stack, top, depth: stack.length, open, requestClose, finishClose };
}
