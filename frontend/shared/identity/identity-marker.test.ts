import { describe, expect, it } from "vitest";

import { ANONYMOUS, isIdentityTransition, markerFor } from "./identity-marker";
import { identityScopedKeys } from "./identity-scoped-keys";

describe("markerFor", () => {
  it("로그인하지 않았으면 익명 표식", () => {
    expect(markerFor(null)).toBe(ANONYMOUS);
  });

  it("로그인했으면 사용자 식별자", () => {
    expect(markerFor("uid-a")).toBe("uid-a");
  });
});

describe("isIdentityTransition", () => {
  it("없음 → 사용자는 전환이다", () => {
    expect(isIdentityTransition(ANONYMOUS, "uid-a")).toBe(true);
  });

  it("사용자 A → 사용자 B는 전환이다", () => {
    expect(isIdentityTransition("uid-a", "uid-b")).toBe(true);
  });

  it("사용자 → 없음은 전환이다", () => {
    expect(isIdentityTransition("uid-a", ANONYMOUS)).toBe(true);
  });

  it("같은 표식이 다시 오면 전환이 아니다 — 토큰 갱신·중복 로그인 이벤트", () => {
    expect(isIdentityTransition("uid-a", "uid-a")).toBe(false);
    expect(isIdentityTransition(ANONYMOUS, ANONYMOUS)).toBe(false);
  });

  it("처리 이력이 없는 새 탭은 전환이 아니다 — 지울 이전 상태가 없다", () => {
    expect(isIdentityTransition(null, "uid-a")).toBe(false);
    expect(isIdentityTransition(null, ANONYMOUS)).toBe(false);
  });
});

describe("identityScopedKeys", () => {
  it("찜·취향 프로필·세션 프로필·신호 세션을 지운다", () => {
    const keys = [
      "atee-wishlist",
      "atee-profile",
      "atee-profile-backup",
      "atee-session-profile",
      "atee-session",
    ];
    expect(identityScopedKeys(keys).sort()).toEqual(keys.sort());
  });

  it("기기에 매인 것은 남긴다", () => {
    const keys = ["atee-device-id", "atee-signal-queue", "atee-pending-forget"];
    expect(identityScopedKeys(keys)).toEqual([]);
  });

  it("고지 배너 확인 여부는 신원이 아니라 기기 것이므로 남긴다", () => {
    expect(identityScopedKeys(["atee-consent-notice-seen-v2"])).toEqual([]);
    expect(identityScopedKeys(["atee-consent-notice-seen"])).toEqual([]);
  });

  it("전환 표식 자체는 남긴다 — 지우면 다음 판정이 새 탭처럼 보인다", () => {
    expect(identityScopedKeys(["atee-identity-tab"])).toEqual([]);
  });

  it("우리 것이 아닌 키는 건드리지 않는다", () => {
    expect(identityScopedKeys(["other-app-data", "sb-auth-token"])).toEqual([]);
  });

  it("앞으로 생길 개인화 키는 기본으로 지운다 — 빠뜨리면 취향이 샌다", () => {
    expect(identityScopedKeys(["atee-something-new"])).toEqual(["atee-something-new"]);
  });
});
