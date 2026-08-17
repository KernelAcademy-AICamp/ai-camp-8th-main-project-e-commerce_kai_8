// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  normalizeQuery,
  useSearchState,
} from "@/features/feed/search/presentation/view-model/use-search-state";

describe("normalizeQuery", () => {
  it("서버 방어와 같은 정규화를 한다 — 앞 60자, 단일 공백", () => {
    expect(normalizeQuery("  나이키   반팔  ")).toBe("나이키 반팔");
    expect(normalizeQuery("가".repeat(100))).toBe("가".repeat(60));
  });

  it("단어 수는 자르지 않는다 — 자르면 서버가 조건을 볼 기회가 없어진다", () => {
    // 예전엔 앞 5단어만 보냈다. 서버가 색·가격 같은 조건을 뽑아내는 지금은
    // 그게 조건을 통째로 삼킨다 — `여름에 입을 검정 반팔티 3만원 이하`는
    // 여섯 번째 단어 `이하`가 잘려 가격 조건이 사라졌다.
    // 서버는 조건을 뽑은 **뒤에** 텍스트 단어만 5개로 자른다.
    expect(normalizeQuery("하나 둘 셋 넷 다섯 여섯 일곱")).toBe(
      "하나 둘 셋 넷 다섯 여섯 일곱",
    );
    expect(normalizeQuery("여름에 입을 검정 반팔티 3만원 이하")).toBe(
      "여름에 입을 검정 반팔티 3만원 이하",
    );
  });
});

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
