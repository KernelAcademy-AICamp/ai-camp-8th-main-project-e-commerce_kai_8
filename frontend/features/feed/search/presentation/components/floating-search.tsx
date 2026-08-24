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
  /** 소프트 키보드가 화면 아래를 가린 높이(px) — 그만큼 위로 띄운다 */
  keyboardInset: number;
  /** 입력에 포커스가 잡혔다 = 키보드가 올라온다 */
  onInputFocus: () => void;
  /** 입력의 포커스가 풀렸다 = 키보드가 내려간다 */
  onInputBlur: () => void;
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 stroke-ink-muted"
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
 * 첫 페이지 하단 중앙의 플로팅 검색창 — 뉴모피즘 이식(#88) 이전 원본 스타일
 * (다크 알약형, 뉴트럴 팔레트)로 되돌린 것.
 *
 * 맨 위에서는 알약 검색창, 스크롤을 내리면 원형 버튼으로 축소되고, 탭하면
 * 다시 펼쳐지며 입력에 포커스가 잡힌다. 축소는 CSS 전환(너비·둥글기·내용
 * 투명도)만 쓴다. 숨김 상태는 inert로 탭 순서·스크린리더에서도 제외한다.
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
  keyboardInset,
  onInputFocus,
  onInputBlur,
}: FloatingSearchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const keyboardOpen = keyboardInset > 0;
  const showClear = (input !== "" || searching) && !collapsed;

  return (
    <form
      role="search"
      inert={hidden}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
        inputRef.current?.blur(); // 제출하면 키보드를 닫는다 (설계 §3)
      }}
      className={`fixed inset-x-0 z-30 mx-auto flex w-full max-w-md justify-center px-4 duration-200 ${
        // ⚠️ **키보드가 떠 있는 동안 bottom은 전환하지 않는다.** 키보드가
        // 올라오는 내내 뷰포트 크기가 연속으로 바뀌는데, 매 변화마다 200ms
        // 전환이 새로 걸리면 검색창이 키보드를 한참 뒤따라 올라온다.
        keyboardOpen ? "transition-opacity" : "transition-[opacity,bottom]"
      } ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
      style={{
        bottom: keyboardOpen
          ? // 키보드는 홈 인디케이터 영역까지 덮는다 — safe-area를 더하면 이중
            // 계산이라 그만큼 붕 뜬다.
            `calc(${String(keyboardInset)}px + 0.5rem)`
          : "calc(1.625rem + env(safe-area-inset-bottom))",
      }}
    >
      <div
        className={`flex h-11 items-center overflow-hidden rounded-full border border-line bg-app/90 shadow-lg shadow-black/40 backdrop-blur transition-[width,padding] duration-[250ms] ease-out ${
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
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          placeholder="티셔츠 검색"
          aria-label="티셔츠 검색"
          tabIndex={collapsed ? -1 : undefined}
          // ⚠️ **글자 크기는 16px(`text-base`) 아래로 내리지 않는다.** iOS Safari는
          // 16px 미만 입력에 포커스하면 화면을 자동으로 확대하고 **포커스가 풀려도
          // 되돌리지 않는다.** `text-sm`(14px)이던 시절 실측: 탭 직후 scale 1.000 →
          // 1.142, offsetLeft 0 → 41이라 검색창 왼쪽이 화면 밖으로 잘렸다.
          className={`min-w-0 border-0 bg-transparent text-base text-ink caret-slate outline-none transition-opacity duration-200 placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden ${
            collapsed ? "w-0 opacity-0" : "w-full opacity-100"
          }`}
        />
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="검색어 지우기"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-xs text-ink-soft"
          >
            ✕
          </button>
        )}
      </div>
    </form>
  );
}
