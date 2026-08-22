"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { GearIcon } from "@/shared/icons";

/** 사이드바 머리줄의 작은 원버튼 — 시안 `.side-logout`과 같은 모양 */
const BTN =
  "flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft neo-sm active:neo-in-sm";

/** 시안 `.set-row` — 줄 사이에 옅은 선, 마지막 줄은 선 없음 */
const ROW =
  "flex w-full items-center justify-between gap-2 border-b border-line px-0.5 py-2.5 text-left text-[12.5px] font-[650] text-ink-soft last:border-b-0 active:text-slate";

/**
 * 설정 — 기어 버튼과 그 아래 펼쳐지는 메뉴(시안 `.set-menu`)를 한 부품으로 묶는다.
 *
 * 버튼과 메뉴가 한 몸이라야 라우트가 **요소 하나만** 건네주면 된다. 여는 상태를
 * 바깥이 들고 있으면 함수를 건네야 하는데, 서버에서 그리는 화면은 함수를 건널 수 없다.
 *
 * **되돌릴 수 없는 동작은 여기서 실행하지 않는다.** 데이터 삭제·회원 탈퇴는 확인
 * 절차가 붙어 있어(방침 O-32), 158px 팝오버 안에서 처리하면 누르는 곳과 지워지는
 * 곳이 붙어버린다. 그 줄들은 확인 절차가 있는 화면으로 보낸다.
 *
 * "보여줄 상품"은 시안 메뉴에 없다. 성별 설정이 나중에 들어온 기능이라 시안에
 * 자리가 없을 뿐이고, 빼면 갈 길이 사라지므로 한 줄 더 둔다.
 */
export function SettingsMenuButton() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc를 누르면 닫는다 — 메뉴가 화면을 붙잡지 않게
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (boxRef.current !== null && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label="설정"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((was) => !was);
        }}
        className={BTN}
      >
        <GearIcon size={15} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="설정"
          className="set-menu-in absolute top-[38px] right-0 z-[4] w-[158px] rounded-[13px] bg-app px-[11px] py-0.5 neo-lg"
        >
          <Link href="/settings" role="menuitem" className={ROW} onClick={close}>
            보여줄 상품
          </Link>
          <Link href="/settings" role="menuitem" className={ROW} onClick={close}>
            데이터 삭제
          </Link>
          <Link href="/privacy" role="menuitem" className={ROW} onClick={close}>
            약관 및 정책
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            className={`${ROW} text-[13px] text-danger active:text-danger`}
            onClick={close}
          >
            회원 탈퇴
          </Link>
        </div>
      )}
    </div>
  );
}
