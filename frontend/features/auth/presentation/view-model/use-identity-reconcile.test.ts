// @vitest-environment jsdom
//
// 신원이 바뀔 때 직전 세션의 종료 줄이 남는가 (계획 2026-08-21 A-2).
//
// 전환 정리가 세션 키를 지우기만 하면, 그 세션은 끝을 못 찍고 사라진다.
// 로그인 직전 세션의 경계가 사라져 전환 분석이 불가능해진다.
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SignalEvent } from "@/shared/signals/types";

vi.mock("@/features/auth/data/auth-repository", () => ({
  fetchLocalUserId: vi.fn(),
  subscribeAuthChange: vi.fn(() => () => undefined),
}));
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
const TAB_MARKER_KEY = "atee-identity-tab";
const ME = "11111111-1111-4111-8111-111111111111";

function queued(): SignalEvent[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as SignalEvent[];
}

/**
 * 테스트마다 모듈을 새로 올린다.
 *
 * 전송 큐가 모듈 수준이라 미전송분을 **메모리에도** 들고 있다. 저장소만 비우면
 * 앞 테스트의 이벤트가 다음 저장 때 되살아난다 (제품 동작이 아니라 테스트가
 * 저장소를 밑에서 갈아 끼우기 때문이다).
 */
async function setup(userId: string | null) {
  vi.resetModules();
  const repo = await import("@/features/auth/data/auth-repository");
  const signals = await import("@/shared/signals/signals");
  const hook =
    await import("@/features/auth/presentation/view-model/use-identity-reconcile");
  vi.mocked(repo.fetchLocalUserId).mockResolvedValue(userId);
  vi.mocked(repo.subscribeAuthChange).mockReturnValue(() => undefined);
  return { repo, signals, hook };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // 전환 정리는 마지막에 페이지를 다시 부른다 — jsdom에 없는 동작이라 막아 둔다.
  // reload만 바꿔 끼우지 못한다(재정의 불가) — location 자체를 최소 스텁으로 둔다.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: "http://localhost/", reload: vi.fn() },
  });
});

describe("useIdentityReconcile — 세션 경계", () => {
  it("신원이 바뀌면 직전 세션의 종료 줄을 남긴다", async () => {
    const { signals, hook } = await setup(ME);
    signals.logImpression({ goodsNo: 1120448 });
    const before = queued()[0]?.session_id;
    // 이 탭은 비회원 상태를 처리해 둔 상태에서 로그인이 일어난다
    sessionStorage.setItem(TAB_MARKER_KEY, "anon");

    renderHook(() => {
      hook.useIdentityReconcile();
    });

    await waitFor(() => {
      const end = queued().find((event) => event.event_type === "session_end");
      expect(end?.session_id).toBe(before);
    });
  });

  it("신원이 그대로면 세션을 끊지 않는다", async () => {
    const { repo, signals, hook } = await setup(ME);
    signals.logImpression({ goodsNo: 1120448 });
    sessionStorage.setItem(TAB_MARKER_KEY, ME);

    renderHook(() => {
      hook.useIdentityReconcile();
    });

    await waitFor(() => {
      expect(vi.mocked(repo.fetchLocalUserId)).toHaveBeenCalled();
    });
    expect(queued().map((event) => event.event_type)).not.toContain("session_end");
  });
});
