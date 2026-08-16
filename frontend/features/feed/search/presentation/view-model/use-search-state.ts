"use client";

import { useCallback, useRef, useState } from "react";

// 서버(c_search_page)의 입력 방어와 같은 값 — 화면 라벨과 실제 검색 조건이
// 어긋나지 않게 제출 시점에 같은 정규화를 미리 적용한다 (외부 리뷰 지적)
const MAX_QUERY_CHARS = 60;
const MAX_QUERY_WORDS = 5;

/** 서버와 동일한 정규화: 앞 60자 → 공백 분리 → 앞 5단어 → 단일 공백 결합 */
export function normalizeQuery(raw: string): string {
  return raw
    .slice(0, MAX_QUERY_CHARS)
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, MAX_QUERY_WORDS)
    .join(" ");
}

/**
 * 검색어 상태 — 입력 중 검색어(input)와 제출되어 현재 결과를 소유하는
 * 검색어(submittedQuery)를 분리한다 (설계 §2). 결과 라벨·페이징은
 * submittedQuery만 참조하므로, 결과를 본 뒤 입력을 고쳐도 결과는 그대로다.
 */
export function useSearchState() {
  const [input, setInputState] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  // submit이 호출 시점의 최신 입력을 보게 ref로 미러링 (렌더 지연과 무관)
  const inputRef = useRef("");

  const setInput = useCallback((value: string) => {
    inputRef.current = value;
    setInputState(value);
  }, []);

  const submit = useCallback(() => {
    const normalized = normalizeQuery(inputRef.current);
    // 빈 검색어 제출은 무시 — 검색 모드 진입/변경 없음 (설계 §4)
    if (normalized !== "") setSubmittedQuery(normalized);
  }, []);

  const clear = useCallback(() => {
    inputRef.current = "";
    setInputState("");
    setSubmittedQuery(null);
  }, []);

  return { input, setInput, submittedQuery, submit, clear };
}
