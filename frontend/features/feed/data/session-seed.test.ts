// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  getSessionSeed,
  regenerateSessionSeed,
} from "@/features/feed/data/session-seed";

beforeEach(() => {
  sessionStorage.clear();
});

describe("regenerateSessionSeed", () => {
  it("이전 세션 시드와 다른 값을 만들고, 이후 getSessionSeed가 그 새 값을 돌려준다", () => {
    const original = getSessionSeed();

    const regenerated = regenerateSessionSeed();

    expect(regenerated).not.toBe(original);
    expect(getSessionSeed()).toBe(regenerated);
  });
});
