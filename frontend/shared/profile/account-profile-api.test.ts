import { beforeEach, describe, expect, it, vi } from "vitest";

import { authedRpc } from "@/shared/supabase/authed-rpc";

import { fetchAccountProfile } from "./account-profile-api";

vi.mock("@/shared/supabase/authed-rpc", () => ({
  authedRpc: vi.fn(),
  AuthedRpcError: class extends Error {},
}));

const authedRpcMock = vi.mocked(authedRpc);

function row(anchors: unknown) {
  return [{ schema_version: 2, anchors, updated_at: "2026-08-20T00:00:00Z" }];
}

beforeEach(() => {
  authedRpcMock.mockReset();
});

describe("fetchAccountProfile — 앵커 gender 보존", () => {
  // 업로드는 gender를 온전히 보내는데 다운로드가 벗겨내면, 새 기기·재로그인에서
  // 성별 없는 앵커가 설치돼 우세 성별 판정이 null이 되고 하드 필터가 조용히 꺼진다.
  it("서버 응답 앵커의 gender를 보존한다", async () => {
    authedRpcMock.mockResolvedValue(
      row([{ goodsNo: 1, weight: 1, lastMs: 1, gender: "여성" }]),
    );

    const profile = await fetchAccountProfile();

    expect(profile.anchors[0].gender).toBe("여성");
  });

  it("유효한 성별 세 값(남성·여성·공용)을 모두 보존한다", async () => {
    authedRpcMock.mockResolvedValue(
      row([
        { goodsNo: 1, weight: 1, lastMs: 1, gender: "남성" },
        { goodsNo: 2, weight: 1, lastMs: 1, gender: "여성" },
        { goodsNo: 3, weight: 1, lastMs: 1, gender: "공용" },
      ]),
    );

    const profile = await fetchAccountProfile();

    expect(profile.anchors.map((a) => a.gender)).toEqual(["남성", "여성", "공용"]);
  });

  it("gender가 없는 앵커는 필드를 두지 않는다", async () => {
    authedRpcMock.mockResolvedValue(row([{ goodsNo: 1, weight: 1, lastMs: 1 }]));

    const profile = await fetchAccountProfile();

    expect(profile.anchors[0]).not.toHaveProperty("gender");
  });

  it("이상값(허용되지 않는 문자열)은 undefined로 떨어뜨린다", async () => {
    authedRpcMock.mockResolvedValue(
      row([{ goodsNo: 1, weight: 1, lastMs: 1, gender: "알수없음" }]),
    );

    const profile = await fetchAccountProfile();

    expect(profile.anchors[0]).not.toHaveProperty("gender");
  });

  it("빈 문자열도 미상으로 취급한다 — 카탈로그에 1,911건 있다", async () => {
    authedRpcMock.mockResolvedValue(
      row([{ goodsNo: 1, weight: 1, lastMs: 1, gender: "" }]),
    );

    const profile = await fetchAccountProfile();

    expect(profile.anchors[0]).not.toHaveProperty("gender");
  });
});
