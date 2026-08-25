// @vitest-environment jsdom
//
// 새로고침해도 노출 귀속이 이어지는가 (계획 2026-08-21 A-1).
//
// 예전에는 "방금 이 상품을 보여줬다"는 기억이 메모리에만 있어 새로고침하면
// 지워졌다. 그 뒤의 클릭은 어느 추천 때문인지 알 수 없어 추천 유형별
// 성적표에서 통째로 빠졌다.
import { beforeEach, describe, expect, it, vi } from "vitest";

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

/** 새로고침 — 저장소는 남고 메모리 상태만 사라진다 */
async function reload() {
  vi.resetModules();
  return import("@/shared/signals/signals");
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.resetModules();
});

describe("노출 귀속", () => {
  it("같은 페이지에서 누르면 그 노출에 귀속된다", async () => {
    const signals = await import("@/shared/signals/signals");
    const impressionId = signals.logImpression({ goodsNo: GOODS });
    signals.logAction("tap", GOODS);

    const tap = queued().find((event) => event.event_type === "tap");
    expect(tap?.impression_id).toBe(impressionId);
  });

  it("새로고침한 뒤에 눌러도 그 노출에 귀속된다", async () => {
    const before = await import("@/shared/signals/signals");
    const impressionId = before.logImpression({ goodsNo: GOODS });

    const after = await reload();
    after.logAction("tap", GOODS);

    const tap = queued().find((event) => event.event_type === "tap");
    expect(tap?.impression_id).toBe(impressionId);
  });
});

describe("중복 노출은 보내지 않는다", () => {
  it("같은 세션에서 같은 상품을 다시 보면 한 번만 남는다", async () => {
    // 스크롤을 위아래로 하면 같은 카드가 다시 잡힌다. 요청만 늘고 지표는 그대로다.
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS });
    signals.logImpression({ goodsNo: GOODS });
    signals.logImpression({ goodsNo: GOODS });

    const 노출 = queued().filter((e) => e.event_type === "impression");
    expect(노출).toHaveLength(1);
  });

  it("다시 봐도 앞선 노출 ID를 그대로 돌려준다", async () => {
    // 클릭 귀속이 끊기면 안 된다 — 두 번째 호출도 첫 노출을 가리켜야 한다
    const signals = await import("@/shared/signals/signals");
    const first = signals.logImpression({ goodsNo: GOODS });
    const again = signals.logImpression({ goodsNo: GOODS });
    expect(again).toBe(first);
  });

  it("다른 상품은 따로 남는다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logImpression({ goodsNo: GOODS });
    signals.logImpression({ goodsNo: GOODS + 1 });

    expect(queued().filter((e) => e.event_type === "impression")).toHaveLength(2);
  });
});
