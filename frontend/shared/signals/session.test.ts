import { describe, expect, it } from "vitest";

import { advanceSession, SESSION_TIMEOUT_MS } from "./session";

const newId = () => "fresh";

describe("advanceSession (세션 경계 = 비활성 30분, O-29)", () => {
  it("저장된 세션이 없으면 새 세션을 시작한다", () => {
    const result = advanceSession(null, 1_000, newId);
    expect(result.state).toEqual({ id: "fresh", lastActivityMs: 1_000 });
    expect(result.started).toBe(true);
    expect(result.endedPrevious).toBeNull();
  });

  it("비활성이 30분 이내면 세션을 유지하고 활동 시각만 갱신한다", () => {
    const prev = { id: "keep", lastActivityMs: 1_000 };
    const now = 1_000 + SESSION_TIMEOUT_MS; // 정확히 30분 = 유지
    const result = advanceSession(prev, now, newId);
    expect(result.state).toEqual({ id: "keep", lastActivityMs: now });
    expect(result.started).toBe(false);
    expect(result.endedPrevious).toBeNull();
  });

  it("비활성이 30분을 넘으면 직전 세션을 끝내고 새 세션을 시작한다", () => {
    const prev = { id: "old", lastActivityMs: 1_000 };
    const now = 1_000 + SESSION_TIMEOUT_MS + 1;
    const result = advanceSession(prev, now, newId);
    expect(result.state).toEqual({ id: "fresh", lastActivityMs: now });
    expect(result.started).toBe(true);
    expect(result.endedPrevious).toEqual(prev);
  });

  it("시계가 뒤로 간 경우(음수 경과)에도 세션을 유지한다", () => {
    const prev = { id: "keep", lastActivityMs: 10_000 };
    const result = advanceSession(prev, 5_000, newId);
    expect(result.state.id).toBe("keep");
    expect(result.started).toBe(false);
  });
});
