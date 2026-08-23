// @vitest-environment jsdom
//
// 이벤트에 **발생 시점의** 로그인 상태와 계측 버전이 박히는가 (계획 A-3).
//
// 미전송 큐는 신원 전환에도 살아남아 나중에 전송된다. 상태를 전송 시점에
// 읽으면 로그인 직전의 비회원 행동이 회원 것으로 둔갑한다.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isSignedInNow } from "@/shared/supabase/session-state";
import { rpcPost } from "@/shared/supabase-rpc";

import type { SignalEvent } from "./types";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn() }));
vi.mock("@/shared/supabase/session-state", () => ({
  isSignedInNow: vi.fn(() => true),
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
  vi.resetModules();
  vi.mocked(rpcPost).mockReset();
  vi.mocked(rpcPost).mockResolvedValue(1);
  vi.mocked(isSignedInNow).mockReturnValue(true);
});

describe("계측 표식", () => {
  it("모든 이벤트에 계측 버전이 박힌다", async () => {
    const signals = await import("./signals");
    const { INSTRUMENTATION_VER } = await import("./types");
    signals.logImpression({ goodsNo: GOODS });

    // 값이 실제로 있어야 한다 — undefined끼리 비교하면 통과해도 아무것도 못 잡는다
    expect(typeof INSTRUMENTATION_VER).toBe("string");
    expect(INSTRUMENTATION_VER).not.toBe("");
    expect(queued().length).toBeGreaterThan(0);
    for (const event of queued()) {
      expect(event.instr_ver).toBe(INSTRUMENTATION_VER);
    }
  });

  it("발생 시점의 로그인 상태가 박힌다", async () => {
    const signals = await import("./signals");
    signals.logImpression({ goodsNo: GOODS });

    for (const event of queued()) {
      expect(event.signed_in).toBe(true);
    }
  });

  it("전송이 늦어져 그 사이 로그아웃해도 표식은 발생 시점 값 그대로다", async () => {
    const signals = await import("./signals");
    signals.logImpression({ goodsNo: GOODS });

    // 로그아웃 — 아직 안 보낸 이벤트가 큐에 남아 있다
    vi.mocked(isSignedInNow).mockReturnValue(false);
    await signals.flushSignalsNow();

    const sent = vi.mocked(rpcPost).mock.calls.at(-1)?.[1] as {
      p_events: SignalEvent[];
    };
    expect(sent.p_events.length).toBeGreaterThan(0);
    for (const event of sent.p_events) {
      expect(event.signed_in).toBe(true);
    }
  });
});
