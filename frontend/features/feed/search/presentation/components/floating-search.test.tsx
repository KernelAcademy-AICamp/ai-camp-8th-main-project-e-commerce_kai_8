// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FloatingSearch } from "@/features/feed/search/presentation/components/floating-search";

const base = {
  input: "감자",
  onInputChange: vi.fn(),
  onSubmit: vi.fn(),
  onClear: vi.fn(),
  searching: true,
  hidden: false,
  collapsed: true,
  onExpand: vi.fn(),
  lifted: false,
};

// vitest에 globals가 꺼져 있어 자동 정리가 안 된다 — 남은 DOM이 다음 검사에 걸린다
afterEach(cleanup);

describe("FloatingSearch", () => {
  /*
   * 회귀: 축소 버튼을 누르면 같은 검색어가 **재제출**돼 결과가 통째로 버려지고
   * 화면이 스켈레톤부터 다시 그려졌다 — 사용자가 본 "펼치면 배경이 사라졌다
   * 돌아온다"의 정체다.
   *
   * 경위: 축소 버튼(`type="button"`)과 제출 버튼(`type="submit"`)이 같은 자리라
   * React가 DOM 노드를 재사용하며 `type`만 바꿨다. 클릭 핸들러의 상태 변경은
   * 기본 동작보다 **먼저** 반영되므로, 브라우저가 기본 동작을 실행할 땐 그
   * 노드가 이미 제출 버튼이었다.
   *
   * ⚠️ **클릭으로는 검사할 수 없다.** jsdom은 폼 제출 기본 동작을 실행하지
   * 않아, 고치기 전 코드로도 이 흐름이 통과한다(실측). 그래서 원인이 된
   * **노드 재사용 자체**를 본다 — key로 갈라 놓으면 두 버튼은 다른 노드다.
   */
  it("축소 버튼과 제출 버튼은 같은 DOM 노드를 쓰지 않는다", () => {
    const { rerender } = render(<FloatingSearch {...base} />);
    const collapsedButton = screen.getByLabelText("검색창 열기");

    rerender(<FloatingSearch {...base} collapsed={false} />);
    const submitButton = screen.getByLabelText("검색");

    expect(submitButton).not.toBe(collapsedButton);
    expect(collapsedButton.isConnected).toBe(false);
  });

  it("축소 버튼은 펼치기만 하고 검색을 제출하지 않는다", () => {
    const onSubmit = vi.fn();
    const onExpand = vi.fn();
    render(<FloatingSearch {...base} onSubmit={onSubmit} onExpand={onExpand} />);

    fireEvent.click(screen.getByLabelText("검색창 열기"));

    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("펼쳐진 상태의 검색 버튼은 제출한다", () => {
    const onSubmit = vi.fn();
    render(<FloatingSearch {...base} collapsed={false} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByLabelText("검색"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
