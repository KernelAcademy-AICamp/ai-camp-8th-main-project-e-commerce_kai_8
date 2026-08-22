// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GenderGate } from "@/features/gender/presentation/components/gender-gate";
import { clearGenderSetting, setGenderSetting } from "@/shared/gender/gender-setting";

function Child() {
  return <div>홈 내용</div>;
}

beforeEach(() => {
  localStorage.clear();
  clearGenderSetting();
});
afterEach(cleanup);

describe("성별 게이트", () => {
  it("고르기 전에는 자식을 그리지 않고 선택 화면을 보여준다", () => {
    render(
      <GenderGate>
        <Child />
      </GenderGate>,
    );
    expect(screen.queryByText("홈 내용")).toBeNull();
    expect(screen.getByRole("group", { name: "볼 상품의 성별" })).toBeTruthy();
  });

  it("고르면 자식을 그린다", () => {
    setGenderSetting("남성");
    render(
      <GenderGate>
        <Child />
      </GenderGate>,
    );
    expect(screen.getByText("홈 내용")).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("이미 저장돼 있으면 선택 화면이 다시 뜨지 않는다", () => {
    // 새로고침·PWA 콜드스타트에 해당한다 — 저장소만 남고 메모리는 비어 있다.
    localStorage.setItem("atee-gender", "여성");
    render(
      <GenderGate>
        <Child />
      </GenderGate>,
    );
    expect(screen.getByText("홈 내용")).toBeTruthy();
  });
});
