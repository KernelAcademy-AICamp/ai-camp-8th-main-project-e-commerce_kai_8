// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGenderSettings } from "@/features/settings/presentation/view-model/use-gender-settings";
import {
  fetchAccountGender,
  putAccountGender,
} from "@/shared/gender/account-gender-api";
import { resetGenderSync } from "@/shared/gender/gender-account-sync";
import {
  clearGenderSetting,
  getGenderSnapshot,
  setGenderSetting,
} from "@/shared/gender/gender-setting";
import { RpcError } from "@/shared/rpc-error";
import { isSignedInNow } from "@/shared/supabase/session-state";

vi.mock("@/shared/gender/account-gender-api", () => ({
  fetchAccountGender: vi.fn(),
  putAccountGender: vi.fn(),
}));
vi.mock("@/shared/supabase/session-state", () => ({ isSignedInNow: vi.fn() }));

const putMock = vi.mocked(putAccountGender);
const fetchMock = vi.mocked(fetchAccountGender);
const signedIn = vi.mocked(isSignedInNow);

beforeEach(() => {
  localStorage.clear();
  clearGenderSetting();
  resetGenderSync();
  putMock.mockReset();
  fetchMock.mockReset();
  // 동기화가 이미 돈 상태라 기준 시각을 안다 — 아래 "기준 시각을 모를 때" 테스트가 반대를 본다
  fetchMock.mockResolvedValue({ gender: "여성", updatedAt: "2026-08-22T00:00:00Z" });
  signedIn.mockReset();
  signedIn.mockReturnValue(true);
  setGenderSetting("여성");
});

describe("설정 화면에서 성별 바꾸기", () => {
  it("성공하면 바뀐 값이 남는다", async () => {
    putMock.mockResolvedValue({
      applied: true,
      gender: "남성",
      updatedAt: "2026-08-22T00:00:00Z",
    });
    const { result } = renderHook(() => useGenderSettings());
    act(() => {
      result.current.choose("남성");
    });
    await waitFor(() => {
      expect(result.current.status.kind).toBe("idle");
    });
    expect(getGenderSnapshot()).toBe("남성");
  });

  it("다른 기기가 더 최신이면 서버 값을 설치하고 충돌로 알린다 — 실패가 아니다", async () => {
    putMock.mockResolvedValue({
      applied: false,
      gender: "여성",
      updatedAt: "2026-08-22T02:00:00Z",
    });
    const { result } = renderHook(() => useGenderSettings());
    act(() => {
      result.current.choose("남성");
    });
    await waitFor(() => {
      expect(result.current.status).toEqual({ kind: "conflict", gender: "여성" });
    });
    expect(getGenderSnapshot()).toBe("여성"); // 내가 고른 값이 아니라 서버 값
  });

  it("서버가 거부하면 이전 값으로 되돌린다 — 화면만 바뀐 상태를 만들지 않는다", async () => {
    putMock.mockRejectedValue(new RpcError("거부", 400));
    const { result } = renderHook(() => useGenderSettings());
    act(() => {
      result.current.choose("남성");
    });
    await waitFor(() => {
      expect(result.current.status.kind).toBe("failed");
    });
    expect(getGenderSnapshot()).toBe("여성");
  });

  it("응답이 없으면 되돌리지 않는다 — 서버가 받았는지 모르기 때문이다", async () => {
    putMock.mockRejectedValue(new RpcError("응답 없음", null));
    const { result } = renderHook(() => useGenderSettings());
    act(() => {
      result.current.choose("남성");
    });
    await waitFor(() => {
      expect(result.current.status.kind).toBe("syncFailed");
    });
    expect(getGenderSnapshot()).toBe("남성");
  });

  it("비회원은 계정에 올리지 않는다", async () => {
    signedIn.mockReturnValue(false);
    const { result } = renderHook(() => useGenderSettings());
    act(() => {
      result.current.choose("남성");
    });
    await waitFor(() => {
      expect(getGenderSnapshot()).toBe("남성");
    });
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("저장 기준 시각", () => {
  it("동기화가 아직 안 돌아 기준 시각을 모르면 먼저 읽어와서 쓴다", async () => {
    // 예전에는 기준 시각이 비어 있으면 "값이 없을 때만 저장"으로 나가, 행이 이미 있는 한
    // 다른 기기가 없어도 **항상 충돌**이 됐다(브라우저 확인에서 잡힌 거짓 신호).
    fetchMock.mockResolvedValue({
      gender: "여성",
      updatedAt: "2026-08-22T03:00:00Z",
    });
    putMock.mockResolvedValue({
      applied: true,
      gender: "남성",
      updatedAt: "2026-08-22T04:00:00Z",
    });
    const { result } = renderHook(() => useGenderSettings());
    act(() => {
      result.current.choose("남성");
    });
    await waitFor(() => {
      expect(result.current.status.kind).toBe("idle");
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(putMock).toHaveBeenCalledWith("남성", "2026-08-22T03:00:00Z");
  });
});
