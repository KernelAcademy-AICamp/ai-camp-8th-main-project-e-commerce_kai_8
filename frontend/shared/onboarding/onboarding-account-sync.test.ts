// @vitest-environment jsdom
//
// 재검증이 잡은 두 가지를 못박는다.
// ① 실패는 `settled`가 아니다 — `settled`로 넘기면 게이트가 완료 사용자에게
//    온보딩을 처음부터 보여준다.
// ① 저장 응답의 **서버 값**을 설치한다 — 보낸 값이 아니다. 다른 탭이 먼저 마쳤으면
//    그쪽 성별이 이기는데, 자기 값을 설치하면 화면과 계정이 갈린다.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GENDER_SETTING_KEY } from "@/shared/gender/gender-setting";

import { fetchAccountOnboarding, putAccountOnboarding } from "./account-onboarding-api";
import {
  getAccountCompleted,
  getOnboardingSyncStatus,
  resetOnboardingSync,
  retryOnboardingSync,
  syncOnboardingWithAccount,
} from "./onboarding-account-sync";
import { getPicksSnapshot, resetOnboardingStore } from "./onboarding-store";

vi.mock("./account-onboarding-api", () => ({
  fetchAccountOnboarding: vi.fn(),
  putAccountOnboarding: vi.fn(),
}));

const fetchMock = vi.mocked(fetchAccountOnboarding);
const putMock = vi.mocked(putAccountOnboarding);

const CARRIED = {
  userId: "u1",
  gender: "여성" as const,
  version: "2026-08-24",
  picks: [
    { goodsNo: 1417691, cardPos: 0, pickSeq: 0 },
    { goodsNo: 4077474, cardPos: 1, pickSeq: 1 },
    { goodsNo: 3867736, cardPos: 2, pickSeq: 2 },
  ],
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetOnboardingSync();
  resetOnboardingStore();
  fetchMock.mockReset();
  putMock.mockReset();
});

describe("계정 조회 실패", () => {
  it("`settled`가 아니라 `failed`다 — 완료 사용자를 온보딩으로 보내지 않기 위해", async () => {
    fetchMock.mockRejectedValue(new Error("네트워크"));

    await syncOnboardingWithAccount("남성", null, () => undefined);

    expect(getOnboardingSyncStatus()).toBe("failed");
    expect(getAccountCompleted()).toBe(false);
  });

  it("「다시 시도」가 `idle`로 되돌려 가드가 다시 돌 수 있게 한다", async () => {
    fetchMock.mockRejectedValue(new Error("네트워크"));
    await syncOnboardingWithAccount("남성", null, () => undefined);

    retryOnboardingSync();

    expect(getOnboardingSyncStatus()).toBe("idle");
  });

  it("실패하지 않았으면 「다시 시도」는 아무것도 하지 않는다", async () => {
    fetchMock.mockResolvedValue(null);
    await syncOnboardingWithAccount("남성", null, () => undefined);

    retryOnboardingSync();

    expect(getOnboardingSyncStatus()).toBe("settled");
  });
});

describe("승계 저장", () => {
  it("보낸 값이 아니라 **서버가 확정한 값**을 설치한다", async () => {
    fetchMock.mockResolvedValue(null);
    // 다른 탭이 먼저 남성으로 마쳤다 — 서버는 그쪽 값을 돌려준다
    putMock.mockResolvedValue({
      gender: "남성",
      completed: true,
      candidatesVersion: "2026-08-24",
      picks: [{ goodsNo: 2086653, cardPos: 0, pickSeq: 0 }],
    });

    let cleared = false;
    await syncOnboardingWithAccount("여성", CARRIED, () => {
      cleared = true;
    });

    expect(localStorage.getItem(GENDER_SETTING_KEY)).toBe("남성");
    expect(getPicksSnapshot()).toEqual([{ goodsNo: 2086653, cardPos: 0, pickSeq: 0 }]);
    expect(cleared).toBe(true);
  });

  it("보낼 때는 **고른 옷과 함께 다닌 성별**을 쓴다 — 기기 성별이 아니다", async () => {
    fetchMock.mockResolvedValue(null);
    putMock.mockResolvedValue({
      gender: "여성",
      completed: true,
      candidatesVersion: "2026-08-24",
      picks: CARRIED.picks,
    });

    // 기기 성별은 남성인데 고른 옷은 여성 후보다
    await syncOnboardingWithAccount("남성", CARRIED, () => undefined);

    expect(putMock).toHaveBeenCalledWith("여성", "2026-08-24", CARRIED.picks);
  });

  it("올리기에 실패하면 보관함을 비우지 않는다", async () => {
    fetchMock.mockResolvedValue(null);
    putMock.mockRejectedValue(new Error("거부"));

    let cleared = false;
    await syncOnboardingWithAccount("여성", CARRIED, () => {
      cleared = true;
    });

    expect(cleared).toBe(false);
    expect(getPicksSnapshot()).toEqual(CARRIED.picks);
  });
});
