"use client";

import { useCallback, useRef, useState } from "react";

import { touchSession } from "@/shared/signals/signals";

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

/** 한 번의 검색 제출 — 계측에 필요한 것을 제출 시점에 모두 잡아 둔다 */
export interface SearchSubmission {
  /** 제출 일련번호. 같은 검색어 재제출도 새 검색이다 */
  seq: number;
  queryNorm: string;
  queryRaw: string;
  /** 제출 시각 (응답 시각이 아니다) */
  occurredAt: string;
  /** 제출 시점의 세션 ID */
  sessionId: string;
}

/**
 * 검색어 상태 — 입력 중 검색어(input)와 제출되어 현재 결과를 소유하는
 * 검색어(submittedQuery)를 분리한다 (설계 §2). 결과 라벨·페이징은
 * submittedQuery만 참조하므로, 결과를 본 뒤 입력을 고쳐도 결과는 그대로다.
 */
export function useSearchState() {
  const [input, setInputState] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  // 계측용 원문 — 정규화가 무엇을 잘라냈는지 알아야 평가셋을 실사용대로 채운다
  // (방침 O-32). 표시·페이징은 submittedQuery만 쓴다.
  const [submittedRaw, setSubmittedRaw] = useState<string | null>(null);
  // 제출 일련번호 — 같은 검색어를 다시 제출해도 새 검색으로 취급한다.
  // 정규화 결과가 같으면 문자열 상태가 안 바뀌어 재검색·재기록이 통째로
  // 누락됐다(구현 리뷰 지적). 계측 시점 정보도 여기서 함께 잡는다 —
  // 응답 시점에 잡으면 느린 검색이 수초 밀리고 30분 세션 경계를 넘을 수 있다.
  const [submission, setSubmission] = useState<SearchSubmission | null>(null);
  // submit이 호출 시점의 최신 입력을 보게 ref로 미러링 (렌더 지연과 무관)
  const inputRef = useRef("");

  const setInput = useCallback((value: string) => {
    inputRef.current = value;
    setInputState(value);
  }, []);

  const submit = useCallback(() => {
    const raw = inputRef.current;
    const normalized = normalizeQuery(raw);
    // 빈 검색어 제출은 무시 — 검색 모드 진입/변경 없음 (설계 §4)
    if (normalized !== "") {
      setSubmittedQuery(normalized);
      setSubmittedRaw(raw);
      setSubmission((prev) => ({
        seq: (prev?.seq ?? 0) + 1,
        queryNorm: normalized,
        queryRaw: raw,
        occurredAt: new Date().toISOString(),
        sessionId: touchSession(),
      }));
    }
  }, []);

  const clear = useCallback(() => {
    inputRef.current = "";
    setInputState("");
    setSubmittedQuery(null);
    setSubmittedRaw(null);
    setSubmission(null);
  }, []);

  return { input, setInput, submittedQuery, submittedRaw, submission, submit, clear };
}
