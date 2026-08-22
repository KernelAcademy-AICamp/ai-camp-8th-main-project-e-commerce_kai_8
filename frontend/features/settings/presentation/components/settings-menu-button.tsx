"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useGenderSettings } from "@/features/settings/presentation/view-model/use-gender-settings";
import { usePrivacySettings } from "@/features/settings/presentation/view-model/use-privacy-settings";
import type { GenderChoice } from "@/shared/gender/gender-setting";
import { GearIcon } from "@/shared/icons";

const CHOICES: readonly GenderChoice[] = ["남성", "여성"];

/** 사이드바 머리줄의 작은 원버튼 — 시안 `.side-logout`과 같은 모양 */
const BTN =
  "flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft neo-sm active:neo-in-sm";

/**
 * 시안 `.set-row`. **글자 색은 여기에 두지 않는다** — 줄마다 다른 색을 주는데,
 * 한 문자열에 두 색을 같이 적으면 나중 규칙이 이겨 의도한 색이 안 먹는다.
 */
const ROW =
  "flex w-full items-center justify-between gap-2 border-b border-line px-0.5 py-2.5 text-left text-[12.5px] font-[650] last:border-b-0";

/**
 * 설정 — 기어 버튼과 그 아래 펼쳐지는 메뉴(시안 `.set-menu`)를 한 부품으로 묶는다.
 *
 * 버튼과 메뉴가 한 몸이라야 라우트가 **요소 하나만** 건네주면 된다. 여는 상태를
 * 바깥이 들고 있으면 함수를 건네야 하는데, 서버에서 그리는 화면은 함수를 건널 수 없다.
 *
 * 성별은 메뉴 안에서 바로 바꾼다. 데이터 삭제는 되돌릴 수 없으므로 **경고창을 한
 * 단계 세운다**(방침 O-32) — 누르는 곳과 지워지는 곳을 떼어 놓는다.
 */
export function SettingsMenuButton() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { gender, status: genderStatus, choose } = useGenderSettings();
  const {
    status: clearStatus,
    requestClear,
    cancelClear,
    confirmClear,
  } = usePrivacySettings();

  const confirming = clearStatus.kind === "confirming";

  // 바깥을 누르거나 Esc를 누르면 닫는다 — 메뉴가 화면을 붙잡지 않게.
  // 경고창이 떠 있는 동안에는 그 창이 판단을 가져간다.
  useEffect(() => {
    if (!open || confirming) return;
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
  }, [open, confirming]);

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
          className="set-menu-in absolute top-[38px] right-0 z-[4] w-[168px] rounded-[13px] bg-app px-[11px] py-0.5 neo-lg"
        >
          {/* 남·여 전환 — 메뉴를 떠나지 않고 그 자리에서 바꾼다 */}
          <div className={`${ROW} text-ink-soft`}>
            <span>보여줄 상품</span>
            <span
              role="radiogroup"
              aria-label="보여줄 상품의 성별"
              className="flex rounded-full bg-app p-[3px] neo-in-sm"
            >
              {CHOICES.map((choice) => {
                const on = gender === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={genderStatus.kind === "saving"}
                    onClick={() => {
                      choose(choice);
                    }}
                    className={`cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors disabled:opacity-60 ${
                      on ? "bg-slate text-on-slate neo-drop" : "text-ink-muted"
                    }`}
                  >
                    {choice.slice(0, 1)}
                  </button>
                );
              })}
            </span>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={requestClear}
            className={`${ROW} cursor-pointer text-ink-soft active:text-slate`}
          >
            데이터 삭제
          </button>

          <Link
            href="/privacy"
            role="menuitem"
            className={`${ROW} text-ink-soft active:text-slate`}
            onClick={close}
          >
            약관 및 정책
          </Link>

          <Link
            href="/settings"
            role="menuitem"
            className={`${ROW} text-[13px] text-danger`}
            onClick={close}
          >
            회원 탈퇴
          </Link>
        </div>
      )}

      {/* 경고창 — 시안 `.del-pop`. 지우는 것은 되돌릴 수 없어 한 단계 세운다. */}
      {confirming && (
        <>
          <button
            type="button"
            aria-label="취소"
            onClick={cancelClear}
            className="fixed inset-0 z-[48] cursor-pointer bg-dim"
          />
          <div
            role="alertdialog"
            aria-label="데이터 삭제"
            className="fixed top-[40%] left-1/2 z-[49] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-app px-[22px] pt-[26px] pb-5 text-center shadow-[0_4px_16px_rgb(30_38_55/0.24)]"
          >
            <strong className="text-[15.5px] font-extrabold text-ink">
              데이터를 지울까요?
            </strong>
            <p className="mt-2 text-xs leading-relaxed font-[650] text-ink-soft">
              지금까지의 탐색 기록과 취향이 사라집니다. 되돌릴 수 없어요.
            </p>
            <div className="mt-[18px] flex gap-2.5">
              <button
                type="button"
                onClick={cancelClear}
                className="h-[42px] flex-1 cursor-pointer rounded-full border border-line text-sm font-extrabold text-ink-soft"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={confirmClear}
                className="h-[42px] flex-1 cursor-pointer rounded-full bg-danger text-sm font-extrabold text-on-slate shadow-[0_1px_4px_rgb(30_38_55/0.28)]"
              >
                지우기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
