// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAccountGender, putAccountGender } from "./account-gender-api";
import {
  getKnownUpdatedAt,
  getSyncStatus,
  resetGenderSync,
  syncGenderWithAccount,
} from "./gender-account-sync";
import {
  clearGenderSetting,
  getGenderSnapshot,
  setGenderSetting,
} from "./gender-setting";

vi.mock("./account-gender-api", () => ({
  fetchAccountGender: vi.fn(),
  putAccountGender: vi.fn(),
}));

const fetchMock = vi.mocked(fetchAccountGender);
const putMock = vi.mocked(putAccountGender);

beforeEach(() => {
  localStorage.clear();
  clearGenderSetting();
  resetGenderSync();
  fetchMock.mockReset();
  putMock.mockReset();
});

describe("계정 동기화", () => {
  it("계정 값이 있으면 그것을 설치하고 승계값은 버린다", async () => {
    fetchMock.mockResolvedValue({ gender: "여성", updatedAt: "2026-08-22T00:00:00Z" });
    const consumed = vi.fn();
    await syncGenderWithAccount("남성", consumed);

    expect(getGenderSnapshot()).toBe("여성"); // 계정이 이긴다
    expect(getKnownUpdatedAt()).toBe("2026-08-22T00:00:00Z");
    expect(consumed).toHaveBeenCalled(); // 승계값을 남기면 다음 로그인에 되살아난다
    expect(putMock).not.toHaveBeenCalled();
    expect(getSyncStatus()).toBe("settled");
  });

  it("계정에 값이 없으면 승계값을 '없을 때만 저장'으로 올린다", async () => {
    fetchMock.mockResolvedValue(null);
    putMock.mockResolvedValue({
      applied: true,
      gender: "남성",
      updatedAt: "2026-08-22T01:00:00Z",
    });
    const consumed = vi.fn();
    await syncGenderWithAccount("남성", consumed);

    // 기대 시각 null = "값이 없을 것으로 안다" (읽고-쓰기 사이의 경합을 서버가 막는다)
    expect(putMock).toHaveBeenCalledWith("남성", null);
    expect(getGenderSnapshot()).toBe("남성");
    expect(consumed).toHaveBeenCalled();
  });

  it("올리는 사이 다른 기기가 값을 넣었으면 서버의 최종 값을 설치한다", async () => {
    fetchMock.mockResolvedValue(null);
    putMock.mockResolvedValue({
      applied: false, // 못 넣었다 — 그 사이 다른 기기가 넣었다
      gender: "여성",
      updatedAt: "2026-08-22T02:00:00Z",
    });
    await syncGenderWithAccount("남성", vi.fn());

    // 내가 고른 '남성'이 아니라 서버의 '여성'을 설치해야 화면과 서버가 안 갈린다
    expect(getGenderSnapshot()).toBe("여성");
    expect(getKnownUpdatedAt()).toBe("2026-08-22T02:00:00Z");
  });

  it("읽기에 실패해도 다시 묻지 않는다 — 기기 값으로 진행한다", async () => {
    setGenderSetting("남성");
    fetchMock.mockRejectedValue(new Error("네트워크 실패"));
    await syncGenderWithAccount(null, vi.fn());

    expect(getGenderSnapshot()).toBe("남성"); // 실패를 "값 없음"으로 오인하지 않는다
    expect(getSyncStatus()).toBe("settled"); // 게이트를 영원히 막지 않는다
  });

  it("올리기에 실패하면 승계값을 남겨 두고 화면은 진행한다", async () => {
    fetchMock.mockResolvedValue(null);
    putMock.mockRejectedValue(new Error("네트워크 실패"));
    const consumed = vi.fn();
    await syncGenderWithAccount("여성", consumed);

    expect(getGenderSnapshot()).toBe("여성");
    expect(consumed).not.toHaveBeenCalled(); // 다음 기회에 다시 시도해야 한다
    expect(getSyncStatus()).toBe("settled");
  });

  it("아무 데도 값이 없으면 아무것도 설치하지 않는다 — 선택 화면으로 간다", async () => {
    fetchMock.mockResolvedValue(null);
    await syncGenderWithAccount(null, vi.fn());

    expect(getGenderSnapshot()).toBeNull();
    expect(putMock).not.toHaveBeenCalled();
    expect(getSyncStatus()).toBe("settled");
  });
});
