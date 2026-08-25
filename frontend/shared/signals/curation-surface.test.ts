// @vitest-environment jsdom
//
// 큐레이션에서 일어난 노출·행동에 자리(surface) 표식이 붙는가.
//
// 이게 없으면 큐레이션에서 판매처로 나간 것이 메인 피드에서 나간 것과 섞여
// "큐레이션을 여는 사람이 있는가"를 물을 수 없다. 그리고 재려고 붙인 계측이
// 취향까지 가르치면 다음 주 숫자가 계측 탓인지 추천이 바뀐 탓인지 못 가른다.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordProfileImpression } from "@/shared/profile/profile-store";
import type { SignalEvent } from "@/shared/signals/types";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn() }));
vi.mock("@/shared/supabase/session-state", () => ({
  isSignedInNow: () => true,
}));
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

function queued(): SignalEvent[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as SignalEvent[];
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("큐레이션 자리 표식", () => {
  it("슬라이드 노출에 curation이 붙고 몇 번째 장인지 남는다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS, surface: "curation", rank: 3 });

    const impression = queued().find((event) => event.event_type === "impression");
    expect(impression?.surface).toBe("curation");
    expect(impression?.rank).toBe(3);
  });

  it("판매처로 나간 것에도 붙는다 — 메인 피드 것과 섞이지 않게", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logAction("outbound", GOODS, { surface: "curation" });

    const outbound = queued().find((event) => event.event_type === "outbound");
    expect(outbound?.surface).toBe("curation");
  });

  it("자리를 안 주면 비어 있다 — 메인 피드는 그대로다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logAction("outbound", GOODS);

    const outbound = queued().find((event) => event.event_type === "outbound");
    expect(outbound?.surface).toBeUndefined();
  });

  it("teachProfile:false면 기록만 하고 취향은 안 가르친다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS, surface: "curation", teachProfile: false });

    expect(queued().some((event) => event.event_type === "impression")).toBe(true);
    expect(recordProfileImpression).not.toHaveBeenCalled();
  });

  it("자리를 안 주면 예전처럼 취향을 가르친다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS });

    expect(recordProfileImpression).toHaveBeenCalledWith(
      GOODS,
      expect.any(String),
      expect.any(Number),
    );
  });
});
