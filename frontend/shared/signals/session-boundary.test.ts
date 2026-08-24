// @vitest-environment jsdom
//
// 백그라운드에 5분 이상 있다 돌아오면 새 세션인가 (계획 2026-08-21 A-2).
//
// 감지가 없으면 카톡 갔다 20분 뒤 돌아온 시간이 통째로 세션 길이에 들어가,
// 세션 길이를 몰입도로 읽을 수 없게 된다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignalEvent } from "@/shared/signals/types";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn() }));
vi.mock("@/shared/supabase/session-state", () => ({ isSignedInNow: () => true }));
vi.mock("@/shared/profile/profile-store", () => ({
  recordProfileImpression: vi.fn(),
  recordProfileAction: vi.fn(),
  getProfileSummary: vi.fn(),
  clearProfile: vi.fn(),
}));
vi.mock("@/shared/supabase/current-user", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("@/shared/profile/account-profile-api", () => ({
  forgetAccountProfile: vi.fn(),
}));

const QUEUE_KEY = "atee-signal-queue";
const GOODS = 1120448;
const T0 = new Date("2026-08-21T10:00:00Z").getTime();

function queued(): SignalEvent[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as SignalEvent[];
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("백그라운드 경계", () => {
  it("5분 넘게 비웠다 돌아오면 직전 세션을 끝내고 새로 시작한다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS });
    const firstSession = queued()[0]?.session_id;

    setVisibility("hidden");
    vi.setSystemTime(T0 + 6 * 60 * 1000);
    setVisibility("visible");
    signals.logAction("tap", GOODS);

    const types = queued().map((event) => event.event_type);
    expect(types).toContain("session_end");
    expect(types.filter((type) => type === "session_start")).toHaveLength(2);

    const tap = queued().find((event) => event.event_type === "tap");
    expect(tap?.session_id).not.toBe(firstSession);
  });

  it("잠깐 비웠다 돌아오면 같은 세션을 이어 간다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS });
    const firstSession = queued()[0]?.session_id;

    setVisibility("hidden");
    vi.setSystemTime(T0 + 60 * 1000);
    setVisibility("visible");
    signals.logAction("tap", GOODS);

    expect(queued().map((e) => e.event_type)).not.toContain("session_end");
    const tap = queued().find((event) => event.event_type === "tap");
    expect(tap?.session_id).toBe(firstSession);
  });
});

describe("신원 변경 경계", () => {
  it("세션을 끝내면 종료 줄이 남고, 다음 활동은 새 세션이 된다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS });
    const firstSession = queued()[0]?.session_id;

    signals.endSessionNow();

    const end = queued().find((event) => event.event_type === "session_end");
    expect(end?.session_id).toBe(firstSession);

    signals.logAction("tap", GOODS);
    const tap = queued().find((event) => event.event_type === "tap");
    expect(tap?.session_id).not.toBe(firstSession);
  });

  it("끝낼 세션이 없으면 아무것도 남기지 않는다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.endSessionNow();
    expect(queued()).toHaveLength(0);
  });
});

describe("나가 있던 시간이 이벤트에 실린다", () => {
  it("잠깐 나갔다 오면 그 시간이 이후 이벤트에 담긴다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS });

    setVisibility("hidden");
    vi.setSystemTime(T0 + 90 * 1000); // 90초 나가 있었다 (5분 미만이라 같은 세션)
    setVisibility("visible");
    signals.logAction("tap", GOODS);

    const tap = queued().find((event) => event.event_type === "tap");
    expect(tap?.away_ms).toBe(90 * 1000);
  });

  it("나간 적이 없으면 0이다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS });
    expect(queued()[0]?.away_ms).toBe(0);
  });
});
