import { describe, expect, it } from "vitest";

import { decideOnboardingStep, type StepInput } from "./onboarding-gate-state";

function step(over: Partial<StepInput>) {
  return decideOnboardingStep({
    session: "out",
    syncSettled: false,
    accountCompleted: false,
    deviceDone: false,
    ...over,
  });
}

describe("decideOnboardingStep", () => {
  it("세션을 모르는 동안에는 묻지도 그리지도 않는다", () => {
    expect(step({ session: "unknown" })).toBe("pending");
    // 기기에 완료 표식이 있어도 마찬가지다 — 계정이 우선이라 기다린다
    expect(step({ session: "unknown", deviceDone: true })).toBe("pending");
  });

  it("로그인했지만 계정 조회 전이면 기다린다 — 이미 마친 사람에게 다시 묻지 않으려고", () => {
    expect(step({ session: "in", syncSettled: false })).toBe("pending");
  });

  it("완료 계정은 홈으로 간다", () => {
    expect(step({ session: "in", syncSettled: true, accountCompleted: true })).toBe(
      "done",
    );
  });

  it("불완전 계정은 온보딩부터 — 갓 만든 빈 계정도 같은 규칙에 걸린다", () => {
    expect(step({ session: "in", syncSettled: true, accountCompleted: false })).toBe(
      "onboarding",
    );
  });

  it("기기 표식이 있어도 계정이 이긴다", () => {
    expect(
      step({
        session: "in",
        syncSettled: true,
        accountCompleted: false,
        deviceDone: true,
      }),
    ).toBe("onboarding");
  });

  it("로그아웃 상태에서 이 기기가 마친 적 있으면 로그인 화면부터", () => {
    expect(step({ session: "out", deviceDone: true })).toBe("login");
  });

  it("처음 온 기기는 온보딩부터", () => {
    expect(step({ session: "out", deviceDone: false })).toBe("onboarding");
  });
});
