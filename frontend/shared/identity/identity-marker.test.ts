import { describe, expect, it } from "vitest";

import { ANONYMOUS, isIdentityTransition, markerFor } from "./identity-marker";
import { identityScopedKeys, personalizationScopedKeys } from "./identity-scoped-keys";

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

  it("없어진 고지 배너의 옛 키는 지운다 — 남길 이유가 사라졌다", () => {
    // 배너를 없앤 2026-08-19 이전 방문자의 저장소에 남아 있는 흔적이다.
    expect(identityScopedKeys(["atee-consent-notice-seen-v2"])).toEqual([
      "atee-consent-notice-seen-v2",
    ]);
  });

  it("전환 표식 자체는 남긴다 — 지우면 다음 판정이 새 탭처럼 보인다", () => {
    expect(identityScopedKeys(["atee-identity-tab"])).toEqual([]);
  });

  it("계정으로 옮길 찜 보관함은 남긴다 — 정리 직전에 빼둔 것이다", () => {
    // 로그인하면 정리가 먼저 돌아 기기 찜을 지운다. 그 직전에 보관함으로
    // 빼두는데, 보관함까지 지우면 옮길 것이 사라진다.
    expect(identityScopedKeys(["atee-wishlist-migrate"])).toEqual([]);
  });

  it("삭제 대기 표식은 남긴다 — 탈퇴 직후 로그아웃이 곧 신원 전환이다", () => {
    // 탈퇴하면 세션이 사라지면서 여기(신원 전환 정리)가 곧바로 돈다.
    // 이 표식을 같이 지우면 "삭제가 서버에 닿았는지" 확인할 손잡이를 잃는다.
    expect(identityScopedKeys(["atee-pending-account-delete"])).toEqual([]);
  });

  it("우리 것이 아닌 키는 건드리지 않는다", () => {
    expect(identityScopedKeys(["other-app-data", "sb-auth-token"])).toEqual([]);
  });

  it("앞으로 생길 개인화 키는 기본으로 지운다 — 빠뜨리면 취향이 샌다", () => {
    expect(identityScopedKeys(["atee-something-new"])).toEqual(["atee-something-new"]);
  });
});

describe("점으로 이어붙인 키도 그물에 걸린다", () => {
  // 하이픈만 보던 시절 최근 본 제품이 빠져나가, 로그아웃해도 앞사람이 본 상품이
  // 다음 사람에게 그대로 보였다 (2026-08-22)
  it("atee.으로 시작하는 키를 지운다", () => {
    expect(identityScopedKeys(["atee.recent-products.v2", "atee.after-login"])).toEqual(
      ["atee.recent-products.v2", "atee.after-login"],
    );
  });

  it("남의 키는 건드리지 않는다", () => {
    expect(identityScopedKeys(["other.thing", "ateex"])).toEqual([]);
  });
});

describe("personalizationScopedKeys", () => {
  it("탐색 흔적을 지운다 — 취향 프로필만이 아니다", () => {
    const keys = [
      "atee-profile",
      "atee-anchor-titles",
      "atee-feed-seed",
      "atee.recent-products.v2",
    ];
    expect(personalizationScopedKeys(keys).sort()).toEqual(keys.sort());
  });

  it("성별과 찜은 남긴다 — 방침 문구가 그렇게 약속한다", () => {
    expect(personalizationScopedKeys(["atee-gender", "atee-wishlist"])).toEqual([]);
  });

  it("삭제 재시도 표식은 남긴다 — 지우면 삭제 약속이 깨진다", () => {
    expect(
      personalizationScopedKeys(["atee-pending-forget", "atee-pending-taste-forget"]),
    ).toEqual([]);
  });
});
