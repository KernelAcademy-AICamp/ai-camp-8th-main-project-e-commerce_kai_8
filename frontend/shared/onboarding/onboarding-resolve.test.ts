import { describe, expect, it } from "vitest";

import type { OnboardingPick } from "./onboarding-pick";
import { resolveOnboardingOnLogin } from "./onboarding-resolve";

const A: OnboardingPick[] = [{ goodsNo: 1, cardPos: 0, pickSeq: 0 }];
const B: OnboardingPick[] = [{ goodsNo: 9, cardPos: 1, pickSeq: 0 }];

describe("resolveOnboardingOnLogin", () => {
  it("계정이 마쳤으면 계정이 이긴다", () => {
    expect(
      resolveOnboardingOnLogin({
        accountCompleted: true,
        accountPicks: A,
        carried: B,
      }),
    ).toEqual({ kind: "useAccount", picks: A, discardCarried: true });
  });

  it("계정이 이기면 로그인 전 선택은 버린다 — 남기면 다음 로그인에 되살아난다", () => {
    const decision = resolveOnboardingOnLogin({
      accountCompleted: true,
      accountPicks: A,
      carried: B,
    });
    expect(decision.kind === "useAccount" && decision.discardCarried).toBe(true);
  });

  it("초기화로 선택이 비어도 마친 것은 마친 것이다 — 다시 묻지 않는다", () => {
    expect(
      resolveOnboardingOnLogin({
        accountCompleted: true,
        accountPicks: [],
        carried: [],
      }),
    ).toEqual({ kind: "useAccount", picks: [], discardCarried: false });
  });

  it("계정이 비었고 로그인 전 선택이 있으면 올린다", () => {
    expect(
      resolveOnboardingOnLogin({
        accountCompleted: false,
        accountPicks: [],
        carried: B,
      }),
    ).toEqual({ kind: "claim", picks: B });
  });

  it("어디에도 없으면 묻는다", () => {
    expect(
      resolveOnboardingOnLogin({
        accountCompleted: false,
        accountPicks: [],
        carried: [],
      }),
    ).toEqual({ kind: "ask" });
  });
});
