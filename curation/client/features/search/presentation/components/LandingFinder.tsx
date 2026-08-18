"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { SearchIcon, SpinnerIcon } from "./icons";

// 첫 화면에서 "이렇게 물어보면 된다"를 가르치는 예시. 셋이 서로 다른 축을 보여준다
// — 위치 / 바탕색×프린트색 / 도안 유형. 통제 어휘(colorway-vocab) 밖의 색을 쓰면
// 프린트색으로 안 잡히고 제목 검색어로 흘러 0건이 되므로, 캐논 색·별칭만 쓴다.
// 바꿀 때는 실제로 결과가 나오는지 확인할 것(과거 "시안"이 0건을 반환했다).
const QUICK_QUERIES = [
  "등판에 오렌지 프린트가 있는 흰 티",
  "검정 바탕 옐로우 프린팅 티",
  "흰 바탕 검정 그래픽 티",
] as const;

export default function LandingFinder() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [placeholder, setPlaceholder] = useState<string>(QUICK_QUERIES[0]);
  const areaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 플레이스홀더에 예시 질의가 타이핑되는 데모 (모션 최소화 설정이면 생략)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let queryIndex = 0;
    let charIndex = 0;
    let erasing = false;

    const id = window.setInterval(() => {
      // 탭이 백그라운드거나 입력에 포커스가 있으면 리렌더를 건너뛴다.
      if (document.hidden || document.activeElement === inputRef.current) return;
      const sample = QUICK_QUERIES[queryIndex % QUICK_QUERIES.length] ?? "";
      if (!erasing) {
        charIndex += 1;
        if (charIndex >= sample.length + 16) erasing = true; // 다 친 뒤 잠깐 머무름
      } else {
        charIndex -= 1;
        if (charIndex <= 0) {
          erasing = false;
          queryIndex = (queryIndex + 1) % QUICK_QUERIES.length;
        }
      }
      setPlaceholder(sample.slice(0, Math.min(charIndex, sample.length)));
    }, 65);

    return () => {
      window.clearInterval(id);
    };
  }, []);

  const search = (value: string, source: "typed" | "chip") => {
    const trimmed = value.trim();
    if (!trimmed || isPending) return;

    // llm=off 모드(로고 토글) 유지 — URL 파라미터로 전파(스펙 결정 2).
    const llmOff = new URLSearchParams(window.location.search).get("llm") === "off";
    startTransition(() => {
      router.push(
        `/search?q=${encodeURIComponent(trimmed)}&src=${source}${llmOff ? "&llm=off" : ""}`,
      );
    });
  };

  return (
    <div
      ref={areaRef}
      id="finder"
      // 스킵 링크(#finder) 대상이 포커스를 받도록. div는 기본 포커스 불가.
      tabIndex={-1}
      className={`tf-finder${isOpen ? " is-open" : ""}`}
      onFocus={() => {
        setIsOpen(true);
      }}
      onBlur={(event) => {
        if (!areaRef.current?.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <form
        className="tf-search"
        role="search"
        aria-busy={isPending}
        onSubmit={(event) => {
          event.preventDefault();
          search(query, "typed");
        }}
      >
        <div className="tf-search__pill">
          <input
            ref={inputRef}
            className="tf-search__input"
            type="search"
            aria-label="티셔츠 검색"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder={placeholder}
            autoComplete="off"
          />
          <button
            className="tf-search__btn"
            type="submit"
            aria-label="검색"
            disabled={!query.trim() || isPending}
            tabIndex={isOpen ? 0 : -1}
          >
            {isPending ? (
              <SpinnerIcon className="tf-search__spinner" />
            ) : (
              <SearchIcon />
            )}
          </button>
        </div>

        <span className="sr-only" aria-live="polite">
          {isPending ? "검색 결과를 불러오는 중입니다." : ""}
        </span>
      </form>

      <div className="tf-chips" aria-label="추천 검색어" aria-hidden={!isOpen}>
        {QUICK_QUERIES.map((item) => (
          <button
            key={item}
            type="button"
            className="tf-chip"
            disabled={isPending}
            tabIndex={isOpen ? 0 : -1}
            onClick={() => {
              search(item, "chip");
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
