// @vitest-environment jsdom
//
// 찜 저장이 실패하면 **시도와 별개로** 실패가 기록되는가 (계획 A-4).
//
// 실패했다고 시도를 지우면 "찜하려 했는데 안 됐다"가 통째로 사라져 제품이
// 멀쩡한 것처럼 보인다. 시도 1줄 + 실패 1줄이다 (정의 §3).
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SignalEvent } from "@/shared/signals/types";

vi.mock("@/features/feed/wishlist/data/wishlist-api", () => ({
  addAccountWish: vi.fn(),
  removeAccountWish: vi.fn(),
  fetchAccountWishes: vi.fn(() => Promise.resolve([])),
  fetchWishFolders: vi.fn(() => Promise.resolve([])),
  createWishFolder: vi.fn(),
  deleteWishFolder: vi.fn(),
  renameWishFolder: vi.fn(),
  WishlistFullError: class WishlistFullError extends Error {},
}));
vi.mock("@/features/feed/wishlist/data/account-wishlist-store", () => ({
  setAccountFolders: vi.fn(),
  setAccountNotice: vi.fn(),
  setAccountWishes: vi.fn(),
}));
vi.mock("@/features/feed/wishlist/data/upload-carried-wishes", () => ({
  uploadCarriedWishes: vi.fn(() => Promise.resolve(undefined)),
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
const GOODS = 1120448;

function queued(): SignalEvent[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as SignalEvent[];
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("찜 저장 실패", () => {
  it("저장이 실패하면 실패 줄을 남긴다", async () => {
    const api = await import("@/features/feed/wishlist/data/wishlist-api");
    vi.mocked(api.addAccountWish).mockRejectedValue(new Error("네트워크"));
    const actions = await import("@/features/feed/wishlist/data/account-wish-actions");

    actions.requestAccountWish(GOODS, true, null);
    await settle();

    const failed = queued().find((event) => event.event_type === "wish_failed");
    expect(failed?.goods_no).toBe(GOODS);
  });

  it("저장이 성공하면 실패 줄을 남기지 않는다", async () => {
    const api = await import("@/features/feed/wishlist/data/wishlist-api");
    vi.mocked(api.addAccountWish).mockResolvedValue(undefined);
    const actions = await import("@/features/feed/wishlist/data/account-wish-actions");

    actions.requestAccountWish(GOODS, true, null);
    await settle();

    expect(queued().map((event) => event.event_type)).not.toContain("wish_failed");
  });

  it("해제가 실패한 것은 찜 저장 실패로 세지 않는다", async () => {
    // 실패율의 분모가 찜 시도라, 해제 실패를 같이 세면 비율이 뜻을 잃는다
    const api = await import("@/features/feed/wishlist/data/wishlist-api");
    vi.mocked(api.removeAccountWish).mockRejectedValue(new Error("네트워크"));
    const actions = await import("@/features/feed/wishlist/data/account-wish-actions");

    actions.requestAccountWish(GOODS, false);
    await settle();

    expect(queued().map((event) => event.event_type)).not.toContain("wish_failed");
  });
});
