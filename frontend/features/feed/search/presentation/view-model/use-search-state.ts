"use client";

import { useCallback, useRef, useState } from "react";

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
    const trimmed = inputRef.current.trim();
    // 빈 검색어 제출은 무시 — 검색 모드 진입/변경 없음 (설계 §4)
    if (trimmed !== "") setSubmittedQuery(trimmed);
  }, []);

  const clear = useCallback(() => {
    inputRef.current = "";
    setInputState("");
    setSubmittedQuery(null);
  }, []);

  return { input, setInput, submittedQuery, submit, clear };
}
