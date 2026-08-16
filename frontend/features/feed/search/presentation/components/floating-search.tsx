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
}

/** 첫 페이지 하단 중앙의 플로팅 검색창 (다크 테마 알약형 — 설계 §3) */
export function FloatingSearch({
  input,
  onInputChange,
  onSubmit,
  onClear,
  searching,
  hidden,
}: FloatingSearchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
        inputRef.current?.blur(); // 제출하면 키보드를 닫는다 (설계 §3)
      }}
      className={`fixed inset-x-0 z-30 mx-auto w-full max-w-md px-4 transition-opacity duration-200 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-2 rounded-full border border-neutral-700/60 bg-neutral-900/90 px-4 py-2.5 shadow-lg shadow-black/40 backdrop-blur">
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
          className="w-full min-w-0 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500 [&::-webkit-search-cancel-button]:hidden"
        />
        {(input !== "" || searching) && (
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
