// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { forgetAccountProfile } from "./account-profile-api";
import {
  hasPendingTasteForget,
  rememberPendingTasteForget,
  retryPendingTasteForget,
} from "./pending-taste-forget";

vi.mock("./account-profile-api", () => ({ forgetAccountProfile: vi.fn() }));

const forgetMock = vi.mocked(forgetAccountProfile);

const STORAGE_KEY = "atee-pending-taste-forget";
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function queued(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? [] : (JSON.parse(raw) as string[]);
}

beforeEach(() => {
  localStorage.clear();
  forgetMock.mockReset();
  forgetMock.mockResolvedValue(1);
});

describe("미완료 취향 삭제 큐", () => {
  it("적어 둔 계정으로 로그인하면 다시 지운다", async () => {
    rememberPendingTasteForget(ME);

    await expect(retryPendingTasteForget(ME)).resolves.toBe(true);

    expect(forgetMock).toHaveBeenCalledTimes(1);
    expect(hasPendingTasteForget()).toBe(false);
  });

  it("성공한 것만 뺀다 — 실패하면 다음 접속에 다시 시도한다", async () => {
    rememberPendingTasteForget(ME);
    forgetMock.mockRejectedValue(new Error("네트워크"));

    await expect(retryPendingTasteForget(ME)).resolves.toBe(false);

    expect(queued()).toEqual([ME]);
  });

  it("다른 사람이 로그인해 있으면 부르지 않는다 — 남의 취향을 지우게 된다", async () => {
    rememberPendingTasteForget(ME);

    await expect(retryPendingTasteForget(OTHER)).resolves.toBe(false);

    expect(forgetMock).not.toHaveBeenCalled();
    // 본인이 다시 로그인할 때까지 남아 있어야 한다
    expect(queued()).toEqual([ME]);
  });

  it("여러 계정이 밀려 있어도 지금 로그인한 사람 것만 뺀다", async () => {
    rememberPendingTasteForget(ME);
    rememberPendingTasteForget(OTHER);

    await retryPendingTasteForget(ME);

    expect(queued()).toEqual([OTHER]);
  });

  it("같은 계정을 두 번 적어도 한 번만 남는다", () => {
    rememberPendingTasteForget(ME);
    rememberPendingTasteForget(ME);

    expect(queued()).toEqual([ME]);
  });

  it("밀린 것이 없으면 서버를 부르지 않는다", async () => {
    await expect(retryPendingTasteForget(ME)).resolves.toBe(false);

    expect(forgetMock).not.toHaveBeenCalled();
  });
});
