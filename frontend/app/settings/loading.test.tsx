// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SettingsLoading from "./loading";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/settings",
}));

describe("설정 로딩 화면", () => {
  it("기다리는 동안에도 뒤로 나갈 수 있다", () => {
    // 응답이 오래 걸리는 경로다. 나갈 길이 없으면 갇힌 것처럼 느껴진다.
    render(<SettingsLoading />);

    expect(screen.getByRole("link", { name: "마이페이지로 돌아가기" })).toBeTruthy();
  });
});
