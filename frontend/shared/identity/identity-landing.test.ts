import { describe, expect, it } from "vitest";

import { requestIdentityLanding, takeIdentityLanding } from "./identity-landing";

describe("identity landing", () => {
  it("부탁이 없으면 없음 — 보던 자리 그대로 다시 뜬다", () => {
    expect(takeIdentityLanding()).toBeNull();
  });

  it("부탁한 자리를 돌려준다", () => {
    requestIdentityLanding("/");
    expect(takeIdentityLanding()).toBe("/");
  });

  it("한 번 읽으면 지워진다 — 다음 전환까지 남으면 엉뚱한 때에 옮긴다", () => {
    requestIdentityLanding("/");
    takeIdentityLanding();
    expect(takeIdentityLanding()).toBeNull();
  });
});
