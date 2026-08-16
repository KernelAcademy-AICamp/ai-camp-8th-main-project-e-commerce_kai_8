import { beforeEach, describe, expect, it, vi } from "vitest";

import { logSearch, postSearchLog } from "@/features/feed/search/data/search-log-api";
import { getDeviceId } from "@/shared/signals/device-id";
import { rpcPost } from "@/shared/supabase-rpc";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn() }));
vi.mock("@/shared/signals/device-id", () => ({ getDeviceId: vi.fn() }));

const rpcPostMock = vi.mocked(rpcPost);
const getDeviceIdMock = vi.mocked(getDeviceId);

const input = {
  queryRaw: "  흰 무지 오버핏 반팔  ",
  queryNorm: "흰 무지 오버핏 반팔",
  resultCount: 12,
  sessionId: "11111111-1111-4111-8111-111111111111",
};

beforeEach(() => {
  rpcPostMock.mockReset();
  getDeviceIdMock.mockReset();
  getDeviceIdMock.mockReturnValue("22222222-2222-4222-8222-222222222222");
});

describe("postSearchLog", () => {
  it("c_log_search RPC에 기기 ID와 한 건짜리 배열을 보낸다", async () => {
    rpcPostMock.mockResolvedValue(1);
    await postSearchLog(input);

    expect(rpcPostMock).toHaveBeenCalledTimes(1);
    const [fn, params, options] = rpcPostMock.mock.calls[0];
    expect(fn).toBe("c_log_search");
    expect(options).toEqual({ timeoutMs: 5_000 });

    const body = params as { p_device: string; p_logs: Record<string, unknown>[] };
    expect(body.p_device).toBe("22222222-2222-4222-8222-222222222222");
    expect(body.p_logs).toHaveLength(1);
  });

  it("원문과 정규화 질의를 모두 남긴다 — 정규화가 무엇을 잘랐는지 알아야 한다", async () => {
    rpcPostMock.mockResolvedValue(1);
    await postSearchLog(input);

    const body = rpcPostMock.mock.calls[0][1] as {
      p_logs: { query_raw: string; query_norm: string }[];
    };
    expect(body.p_logs[0].query_raw).toBe("  흰 무지 오버핏 반팔  ");
    expect(body.p_logs[0].query_norm).toBe("흰 무지 오버핏 반팔");
  });

  it("결과 수가 없으면 null로 남긴다 (검색 실패 시)", async () => {
    rpcPostMock.mockResolvedValue(1);
    await postSearchLog({ ...input, resultCount: null });

    const body = rpcPostMock.mock.calls[0][1] as {
      p_logs: { result_count: number | null }[];
    };
    expect(body.p_logs[0].result_count).toBeNull();
  });

  it("세션 ID와 발생 시각·모델 버전을 함께 남긴다", async () => {
    rpcPostMock.mockResolvedValue(1);
    await postSearchLog(input);

    const body = rpcPostMock.mock.calls[0][1] as {
      p_logs: { session_id: string; occurred_at: string; model_ver: string }[];
    };
    expect(body.p_logs[0].session_id).toBe(input.sessionId);
    expect(Number.isNaN(Date.parse(body.p_logs[0].occurred_at))).toBe(false);
    expect(body.p_logs[0].model_ver).not.toBe("");
  });

  it("호출마다 새 log_id를 만든다 — 재전송 중복 제거 키", async () => {
    rpcPostMock.mockResolvedValue(1);
    await postSearchLog(input);
    await postSearchLog(input);

    const ids = rpcPostMock.mock.calls.map(
      (call) => (call[1] as { p_logs: { log_id: string }[] }).p_logs[0].log_id,
    );
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("logSearch", () => {
  it("기록이 실패해도 예외를 밖으로 던지지 않는다 — 검색을 막으면 안 된다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpcPostMock.mockRejectedValue(new Error("network down"));

    expect(() => {
      logSearch(input);
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
