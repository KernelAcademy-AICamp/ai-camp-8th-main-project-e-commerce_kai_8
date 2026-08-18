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
  keyboardInset: 0,
  onInputFocus: vi.fn(),
  onInputBlur: vi.fn(),
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

  /*
   * 회귀: 폰에서 검색창을 탭하면 키보드 **뒤에 깔려 안 보였다.** `position: fixed`의
   * bottom은 레이아웃 뷰포트 기준이라 키보드가 올라와도 그대로다.
   */
  it("키보드가 가린 높이만큼 위로 올라간다", () => {
    const { container } = render(
      <FloatingSearch {...base} collapsed={false} keyboardInset={340} />,
    );
    const form = container.querySelector("form");

    expect(form?.style.bottom).toContain("340px");
  });

  /*
   * 키보드는 홈 인디케이터 영역까지 덮는다 — safe-area를 더하면 그만큼 붕 뜬다.
   */
  it("키보드가 떠 있는 동안에는 safe-area를 더하지 않는다", () => {
    const { container } = render(
      <FloatingSearch {...base} collapsed={false} keyboardInset={340} />,
    );
    const form = container.querySelector("form");

    expect(form?.style.bottom).not.toContain("safe-area-inset-bottom");
  });

  it("키보드가 없으면 safe-area를 포함한 기본 위치를 쓴다", () => {
    const { container } = render(<FloatingSearch {...base} collapsed={false} />);
    const form = container.querySelector("form");

    expect(form?.style.bottom).toContain("safe-area-inset-bottom");
  });

  /*
   * 회귀: 검색창을 탭하면 **앱 전체가 확대된 채 돌아오지 않았다.**
   *
   * iOS Safari는 폼 입력의 font-size가 16px 미만이면 포커스할 때 화면을 자동으로
   * 확대하고, 포커스가 풀려도 되돌리지 않는다. 이 입력은 `text-sm`(14px)이었다.
   * 시뮬레이터 실측: 탭 직후 `visualViewport.scale` 1.000 → **1.142**,
   * `offsetLeft` 0 → 41 (그래서 검색창 왼쪽이 화면 밖으로 잘렸다).
   *
   * ⚠️ **클래스 이름으로 검사한다.** jsdom은 Tailwind CSS를 계산하지 않아
   * getComputedStyle로는 실제 px를 볼 수 없다. 지키려는 값은 "16px 이상"이고,
   * `text-base`가 그 16px이다. 여기를 더 작은 크기로 되돌리면 확대가 돌아온다.
   */
  it("입력 글자 크기는 iOS 자동 확대 임계값(16px) 아래로 내려가지 않는다", () => {
    render(<FloatingSearch {...base} collapsed={false} />);
    const input = screen.getByLabelText("티셔츠 검색");

    expect(input.className).toContain("text-base");
    expect(input.className).not.toContain("text-sm");
    expect(input.className).not.toContain("text-xs");
  });

  it("입력의 포커스·블러를 알린다", () => {
    const onInputFocus = vi.fn();
    const onInputBlur = vi.fn();
    render(
      <FloatingSearch
        {...base}
        collapsed={false}
        onInputFocus={onInputFocus}
        onInputBlur={onInputBlur}
      />,
    );
    const input = screen.getByLabelText("티셔츠 검색");

    fireEvent.focus(input);
    expect(onInputFocus).toHaveBeenCalledTimes(1);

    fireEvent.blur(input);
    expect(onInputBlur).toHaveBeenCalledTimes(1);
  });
});
