"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useCallback } from "react";

/** 복제본이 날아가는 시간 — 시안 `.fb-fly`의 전환 시간과 같다 */
const FLY_MS = 340;
/** 도착 지점은 헤더 아래 이만큼 — 시안 `hr.bottom + 14` */
const BELOW_HEAD_PX = 14;
/** 모여들며 살짝 커진다 */
const FLY_SCALE = 1.08;

function reduced() {
  if (typeof matchMedia === "undefined") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 폴더를 탭했을 때의 1단계 — 시안 `openFolderDetail`.
 *
 * 탭한 표지를 **복제해** 패널 위에 띄우고, 목록은 사라지며, 복제본이 헤더 아래
 * 중앙으로 모여든다. 다 모이면 폴더 상세로 넘어간다(2단계는 그쪽에서 이어받는다).
 *
 * 원본을 직접 옮기지 않고 복제하는 이유는, 원본이 격자 안에 있어 옮기면 옆 칸이
 * 밀리기 때문이다. 복제본은 패널 기준 절대 위치라 아무것도 밀지 않는다.
 */
export function useFolderOpen(
  panelRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  headRef: RefObject<HTMLElement | null>,
) {
  const router = useRouter();

  return useCallback(
    (event: React.MouseEvent<HTMLElement>, href: string) => {
      const panel = panelRef.current;
      const list = listRef.current;
      const head = headRef.current;
      const cover = event.currentTarget.querySelector("[data-folder-cover]");
      if (reduced() || !panel || !list || !head || !(cover instanceof HTMLElement)) {
        return; // 연출 없이 평소대로 이동한다
      }
      event.preventDefault();

      const from = cover.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const headBox = head.getBoundingClientRect();

      const clone = cover.cloneNode(true) as HTMLElement;
      clone.classList.add("fly-clone");
      clone.style.left = `${String(from.left - panelBox.left)}px`;
      clone.style.top = `${String(from.top - panelBox.top)}px`;
      clone.style.width = `${String(from.width)}px`;
      clone.style.height = `${String(from.height)}px`;
      panel.appendChild(clone);

      const dx = panelBox.width / 2 - from.width / 2 - (from.left - panelBox.left);
      const dy =
        headBox.bottom - panelBox.top + BELOW_HEAD_PX - (from.top - panelBox.top);

      list.classList.add("fade-away");
      requestAnimationFrame(() => {
        clone.style.transform = `translate(${String(dx)}px, ${String(dy)}px) scale(${String(FLY_SCALE)})`;
      });

      setTimeout(() => {
        router.push(href);
        // 이동이 늦어지거나 취소돼도 복제본과 사라진 목록이 남지 않게 되돌린다.
        // 보통은 화면이 바뀌며 통째로 사라지지만, 그것에 기대지 않는다.
        setTimeout(() => {
          clone.remove();
          list.classList.remove("fade-away");
        }, FLY_MS);
      }, FLY_MS);
    },
    [panelRef, listRef, headRef, router],
  );
}
