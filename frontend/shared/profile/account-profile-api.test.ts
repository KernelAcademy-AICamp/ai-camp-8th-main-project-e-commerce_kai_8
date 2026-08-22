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
  it("계정에 저장된 옛 gender 필드는 **읽되 무시한다**", async () => {
    // 그것을 먹던 우세 성별 판정(#63)은 성별 토글(O-39)이 대체하며 걷어냈다.
    // 옛 프로필에 남아 있어도 앵커에 실리지 않아야 한다.
    authedRpcMock.mockResolvedValue(
      row([{ goodsNo: 1, weight: 1, lastMs: 1, gender: "여성" }]),
    );

    const profile = await fetchAccountProfile();

    expect(profile.anchors[0]).toEqual({ goodsNo: 1, weight: 1, lastMs: 1 });
  });

  it("gender가 없는 앵커도 그대로 실린다", async () => {
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
