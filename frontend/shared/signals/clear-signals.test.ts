// @vitest-environment jsdom
//
// 초기화가 **계정에 보관된 취향까지** 지우는지. 이게 빠져 있어서 초기화 뒤에도
// 마이페이지가 옛 취향을 그대로 보여줬고, 다음 접속에는 그 취향이 기기로 다시
// 내려와 개인화가 되살아났다.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { forgetAccountProfile } from "@/shared/profile/account-profile-api";
import { clearSignals } from "@/shared/signals/signals";
import { getCurrentUserId } from "@/shared/supabase/current-user";
import { rpcPost } from "@/shared/supabase-rpc";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn() }));
vi.mock("@/shared/supabase/current-user", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("@/shared/profile/account-profile-api", () => ({
  forgetAccountProfile: vi.fn(),
}));

const rpcPostMock = vi.mocked(rpcPost);
const getCurrentUserIdMock = vi.mocked(getCurrentUserId);
const forgetMock = vi.mocked(forgetAccountProfile);

const TASTE_QUEUE_KEY = "atee-pending-taste-forget";
const DEVICE_QUEUE_KEY = "atee-pending-forget";
const ME = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  rpcPostMock.mockReset();
  rpcPostMock.mockResolvedValue(3);
  getCurrentUserIdMock.mockReset();
  getCurrentUserIdMock.mockResolvedValue(ME);
  forgetMock.mockReset();
  forgetMock.mockResolvedValue(1);
});

describe("clearSignals — 개인화 데이터 초기화", () => {
  it("로그인했으면 계정에 보관된 취향도 지운다", async () => {
    await clearSignals();

    expect(forgetMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TASTE_QUEUE_KEY)).toBeNull();
  });

  it("로그인하지 않았으면 계정 취향은 부르지 않는다", async () => {
    getCurrentUserIdMock.mockResolvedValue(null);

    await clearSignals();

    expect(forgetMock).not.toHaveBeenCalled();
  });

  it("취향 삭제가 실패하면 그 계정을 재시도 큐에 적는다", async () => {
    forgetMock.mockRejectedValue(new Error("네트워크"));

    await clearSignals();

    expect(JSON.parse(localStorage.getItem(TASTE_QUEUE_KEY) ?? "[]")).toEqual([ME]);
  });

  it("취향 삭제가 밀리면 '삭제했습니다'로 끝내지 않는다", async () => {
    forgetMock.mockRejectedValue(new Error("네트워크"));

    // null = 화면이 "다음 접속에서 다시 시도됩니다"를 보여주는 값.
    // 기기 기록은 지워졌더라도 서버에 취향이 남았으면 완료라고 말하면 안 된다.
    await expect(clearSignals()).resolves.toBeNull();
  });

  it("기기 기록 삭제가 실패해도 계정 취향은 따로 시도한다", async () => {
    rpcPostMock.mockRejectedValue(new Error("네트워크"));

    await clearSignals();

    expect(forgetMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DEVICE_QUEUE_KEY)).not.toBeNull();
  });

  it("둘 다 성공하면 지운 행 수를 그대로 돌려준다", async () => {
    await expect(clearSignals()).resolves.toBe(3);
  });

  it("기기 저장소도 함께 비운다", async () => {
    localStorage.setItem("atee-profile", JSON.stringify({ anchors: [] }));
    localStorage.setItem("atee-signal-queue", "[]");

    await clearSignals();

    expect(localStorage.getItem("atee-profile")).toBeNull();
    expect(localStorage.getItem("atee-signal-queue")).toBeNull();
  });
});
