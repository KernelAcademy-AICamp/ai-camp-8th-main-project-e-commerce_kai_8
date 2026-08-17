"use client";

import { useRef } from "react";

interface FloatingSearchProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  /** 검색 모드(제출된 검색어 있음) — X 버튼을 항상 보여 복귀 경로를 연다 */
  searching: boolean;
  /** 상세 레이어가 덮은 동안 표시만 숨긴다 — 언마운트하면 입력값이 사라진다 (설계 §2) */
  hidden: boolean;
  /** 스크롤로 축소된 상태 — 원형 버튼만 보인다 (설계 §3) */
  collapsed: boolean;
  /** 축소 버튼을 탭했을 때 — 재확장 요청 */
  onExpand: () => void;
  /** 하단 고지 배너가 보이는 동안 그 위로 물러난다 (설계 §3) */
  lifted: boolean;
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 stroke-neutral-400"
      fill="none"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.5 13.5 3.5 3.5" />
    </svg>
  );
}

/**
 * 첫 페이지 하단 중앙의 플로팅 검색창 (다크 테마 알약형 — 설계 §3).
 * 스크롤을 내리면 원형 버튼으로 축소되고, 탭하면 다시 펼쳐지며 입력에
 * 포커스가 잡힌다. 축소는 CSS 전환(너비·둥글기·내용 투명도)만 쓴다.
 * 숨김 상태는 inert로 탭 순서·스크린리더에서도 제외한다.
 */
export function FloatingSearch({
  input,
  onInputChange,
  onSubmit,
  onClear,
  searching,
  hidden,
  collapsed,
  onExpand,
  lifted,
}: FloatingSearchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <form
      role="search"
      inert={hidden}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
        inputRef.current?.blur(); // 제출하면 키보드를 닫는다 (설계 §3)
      }}
      className={`fixed inset-x-0 z-30 mx-auto flex w-full max-w-md justify-center px-4 transition-[opacity,bottom] duration-200 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{
        bottom: lifted
          ? "calc(9rem + env(safe-area-inset-bottom))"
          : "calc(1rem + env(safe-area-inset-bottom))",
      }}
    >
      <div
        className={`flex h-11 items-center overflow-hidden rounded-full border border-neutral-700/60 bg-neutral-900/90 shadow-lg shadow-black/40 backdrop-blur transition-[width,padding] duration-250 ease-out ${
          collapsed ? "w-11 justify-center px-0" : "w-full gap-2 px-4"
        }`}
      >
        {collapsed ? (
          <button
            // ⚠️ **key로 제출 버튼과 갈라 둔다.** 없으면 React가 같은 자리의
            // `<button>`을 재사용해 `type`만 "button"→"submit"으로 바꾼다.
            key="expand"
            type="button"
            aria-label="검색창 열기"
            onClick={(event) => {
              // ⚠️ **기본 동작을 막는다.** onExpand()의 상태 변경은 이 핸들러
              // 안에서 동기 반영되고, 브라우저는 **그 뒤에** 클릭의 기본 동작을
              // 실행한다. 그때 이 버튼은 이미 제출 버튼이라 폼이 제출됐다 —
              // 같은 검색어가 재제출(seq 1→2)되면서 결과가 통째로 버려지고
              // 스켈레톤부터 다시 그렸다. 그게 "펼치면 배경이 사라졌다 돌아온다".
              event.preventDefault();
              onExpand();
              inputRef.current?.focus(); // 재확장하며 바로 입력 가능 (설계 §3)
            }}
            className="flex h-full w-full cursor-pointer items-center justify-center"
          >
            <SearchIcon />
          </button>
        ) : (
          <button
            key="submit"
            type="submit"
            aria-label="검색"
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center"
          >
            <SearchIcon />
          </button>
        )}
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={input}
          onChange={(event) => {
            onInputChange(event.target.value);
          }}
          placeholder="티셔츠 검색"
          aria-label="티셔츠 검색"
          tabIndex={collapsed ? -1 : undefined}
          className={`min-w-0 bg-transparent text-sm text-neutral-100 outline-none transition-opacity duration-200 placeholder:text-neutral-500 [&::-webkit-search-cancel-button]:hidden ${
            collapsed ? "w-0 opacity-0" : "w-full opacity-100"
          }`}
        />
        {(input !== "" || searching) && !collapsed && (
          <button
            type="button"
            onClick={onClear}
            aria-label="검색어 지우기"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-700/70 text-xs text-neutral-300"
          >
            ✕
          </button>
        )}
      </div>
    </form>
  );
}
