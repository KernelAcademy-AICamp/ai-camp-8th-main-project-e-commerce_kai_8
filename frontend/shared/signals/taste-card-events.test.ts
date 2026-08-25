// @vitest-environment jsdom
//
// 마이페이지 취향 분석의 조회·새로고침 기록 (계획 2026-08-25 A-3).
//
// 없으면 "취향 카드를 사람들이 실제로 쓰는가"에 답할 수 없다. 카드가 떴는지,
// 내용이 보였는지, 새로고침을 눌러 무엇이 일어났는지가 어디에도 안 남는다.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SignalEvent } from "@/shared/signals/types";
import { isSignedInNow } from "@/shared/supabase/session-state";

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

function queued(): SignalEvent[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as SignalEvent[];
}

/** 세션 경계 줄(session_start·session_end)을 뺀 나머지 — 이 파일이 보는 대상 */
function tasteEvents(): SignalEvent[] {
  return queued().filter(
    (e) => e.event_type === "taste_view" || e.event_type === "taste_refresh",
  );
}

beforeEach(() => {
  vi.mocked(isSignedInNow).mockReturnValue(true);
  localStorage.clear();
  sessionStorage.clear();
  // 모듈 안 큐가 테스트 사이에 남지 않게 한다 — 이 저장소의 신호 테스트 관례다
  vi.resetModules();
});

describe("logTasteView — 취향 카드가 최종 상태에 도달했다", () => {
  it("내용이 보이면 rendered로 남는다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logTasteView("rendered");

    const events = tasteEvents();
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("taste_view");
    expect(events[0].outcome).toBe("rendered");
  });

  it("아직 모으는 중과 불러오기 실패를 서로 다르게 남긴다", async () => {
    // 둘을 뭉치면 "신규 사용자라 잴 게 없다"와 "고장났다"를 구분할 수 없다.
    const signals = await import("@/shared/signals/signals");
    signals.logTasteView("insufficient_data");
    signals.logTasteView("error");

    expect(tasteEvents().map((e) => e.outcome)).toEqual([
      "insufficient_data",
      "error",
    ]);
  });

  it("상품 번호를 싣지 않는다 — 카드는 한 상품에 대한 것이 아니다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logTasteView("rendered");
    expect(tasteEvents()[0].goods_no).toBeUndefined();
  });

  it("로그인하지 않았으면 아무것도 남기지 않는다 (O-37)", async () => {
    vi.mocked(isSignedInNow).mockReturnValue(false);
    const signals = await import("@/shared/signals/signals");
    signals.logTasteView("rendered");
    expect(queued()).toHaveLength(0);
  });
});

describe("logTasteRefresh — 새로고침을 눌렀다", () => {
  it("결과 네 가지를 각각 남긴다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logTasteRefresh("updated");
    signals.logTasteRefresh("no_new_activity");
    signals.logTasteRefresh("ignored_duplicate");
    signals.logTasteRefresh("error");

    const events = tasteEvents();
    expect(events.every((e) => e.event_type === "taste_refresh")).toBe(true);
    expect(events.map((e) => e.outcome)).toEqual([
      "updated",
      "no_new_activity",
      "ignored_duplicate",
      "error",
    ]);
  });

  it("도는 중에 막힌 클릭도 남는다 — 누른 횟수와 실제로 돈 횟수가 둘 다 필요하다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logTasteRefresh("updated");
    signals.logTasteRefresh("ignored_duplicate");

    expect(tasteEvents()).toHaveLength(2);
  });

  it("로그인하지 않았으면 아무것도 남기지 않는다 (O-37)", async () => {
    vi.mocked(isSignedInNow).mockReturnValue(false);
    const signals = await import("@/shared/signals/signals");
    signals.logTasteRefresh("updated");
    expect(queued()).toHaveLength(0);
  });
});

describe("공통 필드", () => {
  it("세션 ID와 계측 버전이 실린다 — 다른 이벤트와 같은 세션으로 묶여야 한다", async () => {
    const signals = await import("@/shared/signals/signals");
    signals.logTasteView("rendered");
    signals.logTasteRefresh("updated");

    const [view, refresh] = tasteEvents();
    expect(view.session_id).toBe(refresh.session_id);
    expect(view.instr_ver).toBe("v2");
    expect(view.signed_in).toBe(true);
  });

  it("세션 시작 줄과 같은 세션에 묶인다", async () => {
    // 취향 카드 기록만 따로 노는 세션이 되면 세션 단위 지표에서 빠진다.
    const signals = await import("@/shared/signals/signals");
    signals.logTasteView("rendered");

    const start = queued().find((e) => e.event_type === "session_start");
    expect(start?.session_id).toBe(tasteEvents()[0].session_id);
  });
});
