"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { readEntryValue, withEntryValue } from "@/shared/history/history-state";
import { scrollHostFor } from "@/shared/scroll/scroll-host";

/** 이 화면이 히스토리 항목에 쓰는 자리 이름 */
const CURATION_KEY = "aTeeCuration";

function readCurationKey(state: unknown): string | null {
  const raw = readEntryValue(state, CURATION_KEY);
  return typeof raw === "string" ? raw : null;
}

/**
 * FOR YOU 칸의 목록 ↔ 큐레이션 상세 전환.
 *
 * 주소는 그대로지만 **화면이 통째로 바뀌고 자기 뒤로가기(← 큐레이션)를 내놓는다.**
 * 그러면 사용자는 시스템 뒤로가기도 같은 일을 하리라 기대한다. 그래서 전환할 때
 * 히스토리를 한 칸 쌓는다 — 예전에는 쌓지 않아, 여기서 스와이프 뒤로가기를 하면
 * 목록으로 돌아오는 게 아니라 홈 화면 자체를 떠났다.
 *
 * 어느 큐레이션이 열려 있는지는 **항목 자체에 적는다.** 화면 쪽 기억은 뒤로가기·
 * 새로고침·앱 재기동으로 사라지지만 항목은 남기 때문이다 (`shared/history`).
 */
export function useCurationScreen(anchorRef: RefObject<HTMLElement | null>) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  /** 목록으로 돌아왔을 때 보던 자리로 — 굴리는 것은 이 화면이 놓인 칸이다(shared/scroll) */
  const listScrollY = useRef(0);

  // 항목만 남고 화면 쪽 기억이 사라진 자리에서 시작할 수 있다.
  //
  // 히스토리는 **마운트한 뒤에야** 읽을 수 있다 — 서버에는 없으므로 첫 렌더에서
  // 읽으면 서버가 그린 것과 달라져 하이드레이션이 어긋난다. 그래서 규칙이 말리는
  // "effect 안 setState"를 여기서는 일부러 쓴다. 마운트 때 한 번뿐이다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenKey(readCurationKey(window.history.state));
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      setOpenKey(readCurationKey(event.state));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const open = useCallback(
    (key: string) => {
      listScrollY.current = scrollHostFor(anchorRef.current).top();
      setOpenKey(key);
      window.history.pushState(
        withEntryValue(window.history.state, CURATION_KEY, key),
        "",
      );
    },
    [anchorRef],
  );

  // 화면 안의 ← 큐레이션도 스와이프와 같은 길을 지나야 한다 —
  // 그래야 히스토리와 화면이 갈리지 않는다
  const back = useCallback(() => {
    window.history.back();
  }, []);

  useEffect(() => {
    const host = scrollHostFor(anchorRef.current);
    if (openKey === null) {
      host.moveTo(listScrollY.current);
      return;
    }
    host.moveTo(0);
  }, [openKey, anchorRef]);

  return { openKey, open, back };
}
