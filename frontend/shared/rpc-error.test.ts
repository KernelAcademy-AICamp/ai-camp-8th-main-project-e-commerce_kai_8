import { describe, expect, it } from "vitest";

import { isFallbackable, isRetryable, RpcError, rpcErrorKind } from "./rpc-error";

describe("RPC 오류 분류", () => {
  it("인자·시그니처 오류는 계약 오류다 — 다시 해도 같다", () => {
    for (const status of [400, 404, 422]) {
      expect(new RpcError("x", status).kind).toBe("contract");
      expect(isRetryable(new RpcError("x", status))).toBe(false);
      expect(isFallbackable(new RpcError("x", status))).toBe(false);
    }
  });

  it("표에 없는 나머지 4xx도 계약 오류로 본다 — 분류기가 놓쳐 갈리지 않게", () => {
    for (const status of [406, 409, 415]) {
      expect(new RpcError("x", status).kind).toBe("contract");
    }
  });

  it("일시 제한은 다시 시도한다 — 영구 오류로 묶으면 서버가 회복해도 못 돌아온다", () => {
    for (const status of [408, 429]) {
      expect(new RpcError("x", status).kind).toBe("throttle");
      expect(isRetryable(new RpcError("x", status))).toBe(true);
      expect(isFallbackable(new RpcError("x", status))).toBe(true);
    }
  });

  it("인증·권한 오류는 폴백도 재시도도 하지 않는다", () => {
    for (const status of [401, 403]) {
      expect(new RpcError("x", status).kind).toBe("auth");
      expect(isRetryable(new RpcError("x", status))).toBe(false);
      expect(isFallbackable(new RpcError("x", status))).toBe(false);
    }
  });

  it("서버 오류와 응답 없음은 일시적 실패다", () => {
    expect(new RpcError("x", 500).kind).toBe("transient");
    expect(new RpcError("x", 503).kind).toBe("transient");
    expect(new RpcError("x", null).kind).toBe("transient"); // 네트워크·시간 초과
    expect(isRetryable(new RpcError("x", 500))).toBe(true);
  });

  it("RpcError가 아닌 오류는 일시적으로 본다 — 모르는 실패로 화면을 막지 않는다", () => {
    expect(rpcErrorKind(new Error("어디선가 난 오류"))).toBe("transient");
    expect(isRetryable(new Error("x"))).toBe(true);
  });
});
