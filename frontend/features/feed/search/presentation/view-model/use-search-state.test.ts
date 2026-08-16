// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSearchState } from "@/features/feed/search/presentation/view-model/use-search-state";

describe("useSearchState", () => {
  it("입력값 변경은 제출된 검색어에 영향을 주지 않는다", () => {
    const { result } = renderHook(() => useSearchState());
    act(() => {
      result.current.setInput("나이키");
      result.current.submit();
    });
    expect(result.current.submittedQuery).toBe("나이키");
    act(() => {
      result.current.setInput("나이키 반팔");
    });
    // 결과를 소유하는 건 마지막 제출 — 입력만 바꿔선 안 바뀐다
    expect(result.current.submittedQuery).toBe("나이키");
    expect(result.current.input).toBe("나이키 반팔");
  });

  it("제출 시 앞뒤 공백을 정리하고, 빈 검색어는 무시한다", () => {
    const { result } = renderHook(() => useSearchState());
    act(() => {
      result.current.setInput("  나이키  ");
      result.current.submit();
    });
    expect(result.current.submittedQuery).toBe("나이키");
    act(() => {
      result.current.setInput("   ");
      result.current.submit();
    });
    // 공백만 제출하면 기존 검색을 유지한다 (검색 모드 진입/변경 없음)
    expect(result.current.submittedQuery).toBe("나이키");
  });

  it("clear는 입력값과 제출된 검색어를 모두 비워 피드로 복귀시킨다", () => {
    const { result } = renderHook(() => useSearchState());
    act(() => {
      result.current.setInput("나이키");
      result.current.submit();
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.input).toBe("");
    expect(result.current.submittedQuery).toBeNull();
  });
});
