// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackLink } from "@/shared/history/back-link";
import { withNavMark } from "@/shared/history/nav-mark";

const back = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace }),
  usePathname: () => "/settings",
}));

const arrow = () => screen.getByRole("link", { name: "마이페이지로 돌아가기" });

beforeEach(() => {
  // 이 설정에는 자동 정리가 없다 — 안 지우면 앞 테스트의 화살표가 남아 겹친다
  cleanup();
  back.mockClear();
  replace.mockClear();
  window.history.replaceState({}, "");
});

describe("BackLink", () => {
  it("주소를 가진 링크로 그려진다", () => {
    // 스크립트가 꺼져도 이동은 되어야 한다 — 공개 처리방침은 구글 심사가 여는 페이지다.
    render(
      <BackLink href="/my" label="마이페이지로 돌아가기">
        ←
      </BackLink>,
    );
    expect(arrow().getAttribute("href")).toBe("/my");
  });

  it("안쪽 자리에서 누르면 새로 쌓지 않고 되돌아간다", () => {
    window.history.replaceState(withNavMark({}, "inner"), "");
    render(<BackLink href="/my" label="마이페이지로 돌아가기" />);

    fireEvent.click(arrow());

    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("첫 자리에서 누르면 라벨이 가리키는 화면으로 간다", () => {
    window.history.replaceState(withNavMark({}, "root"), "");
    render(<BackLink href="/my" label="마이페이지로 돌아가기" />);

    fireEvent.click(arrow());

    expect(replace).toHaveBeenCalledWith("/my");
    expect(back).not.toHaveBeenCalled();
  });
});
