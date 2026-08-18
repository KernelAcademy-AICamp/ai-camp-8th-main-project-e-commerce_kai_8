import { describe, expect, it } from "vitest";

import { decideDeletionFollowUp, DELETION_MARKER_MAX_AGE_MS } from "./pending-deletion";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;

const marker = {
  userId: "user-A",
  providerId: "google-sub-1",
  requestedAt: NOW - DAY,
};

describe("표식이 없을 때", () => {
  it("할 일이 없다", () => {
    expect(
      decideDeletionFollowUp(
        null,
        { userId: "user-A", providerId: "google-sub-1" },
        NOW,
      ),
    ).toEqual({ kind: "none" });
  });
});

describe("아직 로그인하지 않았을 때", () => {
  it("표식을 그대로 둔다 — 비교할 대상이 없다", () => {
    expect(decideDeletionFollowUp(marker, null, NOW)).toEqual({ kind: "none" });
  });
});

describe("만료", () => {
  it("30일이 지나면 버린다", () => {
    const old = { ...marker, requestedAt: NOW - DELETION_MARKER_MAX_AGE_MS - 1 };
    expect(
      decideDeletionFollowUp(
        old,
        { userId: "user-A", providerId: "google-sub-1" },
        NOW,
      ),
    ).toEqual({ kind: "clearExpired" });
  });

  it("정확히 30일째는 아직 유지한다", () => {
    const edge = { ...marker, requestedAt: NOW - DELETION_MARKER_MAX_AGE_MS };
    expect(
      decideDeletionFollowUp(
        edge,
        { userId: "user-A", providerId: "google-sub-1" },
        NOW,
      ),
    ).toEqual({ kind: "retry" });
  });

  it("로그인하지 않았어도 만료된 표식은 버린다", () => {
    const old = { ...marker, requestedAt: NOW - DELETION_MARKER_MAX_AGE_MS - 1 };
    expect(decideDeletionFollowUp(old, null, NOW)).toEqual({ kind: "clearExpired" });
  });
});

describe("구글 신원부터 비교한다", () => {
  it("구글 신원이 다르면 표식을 유지하고 알린다", () => {
    // 다른 구글 계정으로 로그인한 것. 원래 계정이 지워졌는지 알 수 없으므로
    // 손잡이를 버리면 안 된다.
    expect(
      decideDeletionFollowUp(
        marker,
        { userId: "user-B", providerId: "google-sub-2" },
        NOW,
      ),
    ).toEqual({ kind: "keepAndWarn" });
  });

  it("구글 신원이 같고 사용자 식별자가 다르면 다시 지우지 않고 표식만 정리한다", () => {
    // 첫 삭제가 성공하고 같은 구글 계정으로 재가입된 것.
    // 여기서 재호출하면 **방금 만든 계정**을 지운다.
    expect(
      decideDeletionFollowUp(
        marker,
        { userId: "user-A2", providerId: "google-sub-1" },
        NOW,
      ),
    ).toEqual({ kind: "clearCompleted" });
  });

  it("둘 다 같으면 삭제가 서버에 닿지 않은 것이므로 다시 지운다", () => {
    expect(
      decideDeletionFollowUp(
        marker,
        { userId: "user-A", providerId: "google-sub-1" },
        NOW,
      ),
    ).toEqual({ kind: "retry" });
  });

  it("사용자 식별자만 같고 구글 신원이 다르면 유지한다 — 식별자만 보면 오판한다", () => {
    expect(
      decideDeletionFollowUp(
        marker,
        { userId: "user-A", providerId: "google-sub-2" },
        NOW,
      ),
    ).toEqual({ kind: "keepAndWarn" });
  });
});
