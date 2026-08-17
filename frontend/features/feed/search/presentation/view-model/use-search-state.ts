"use client";

import { useCallback, useRef, useState } from "react";

import { touchSession } from "@/shared/signals/signals";

// 서버의 입력 방어와 같은 값 — 화면 라벨과 실제 검색 조건이 어긋나지 않게
// 제출 시점에 같은 정규화를 미리 적용한다.
//
// ⚠️ **단어 수는 여기서 자르지 않는다.** 예전엔 앞 5단어만 보냈는데, 서버가
// 색·가격 같은 조건을 뽑아내는 지금은 그게 조건을 통째로 삼킨다 —
// `여름에 입을 검정 반팔티 3만원 이하`는 여섯 번째 단어 `이하`가 잘려 가격
// 조건이 사라졌다. 서버는 조건을 뽑은 **뒤에** 텍스트 단어만 5개로 자른다.
// 여기서 미리 자르면 서버의 수정이 사용자에게 닿지 않는다(교차 리뷰 M1).
//
// 60자 상한은 그대로 둔다 — 그게 실제 방어선이다.
const MAX_QUERY_CHARS = 60;

/** 서버와 동일한 정규화: 앞 60자 → 공백 분리 → 단일 공백 결합 */
export function normalizeQuery(raw: string): string {
  return raw
    .slice(0, MAX_QUERY_CHARS)
    .split(/\s+/)
    .filter((word) => word !== "")
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
