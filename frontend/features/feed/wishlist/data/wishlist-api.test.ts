import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAccountWishes } from "@/features/feed/wishlist/data/wishlist-api";
import { authedRpc } from "@/shared/supabase/authed-rpc";

vi.mock("@/shared/supabase/authed-rpc", () => ({
  authedRpc: vi.fn(),
  AuthedRpcError: class extends Error {},
}));

const authedRpcMock = vi.mocked(authedRpc);

const row = {
  goods_no: 6525463,
  title: "반팔 티셔츠",
  brand_name: "브랜드",
  price_final: 29900,
  thumbnail: "https://image.msscdn.net/images/goods_img/a_500.jpg",
  gender: "공용",
  gallery: ["/images/prd_img/detail_1_500.jpg", "/images/prd_img/detail_2_500.jpg"],
  width: 500,
  height: 600,
  added_at: "2026-08-20T00:00:00Z",
};

beforeEach(() => {
  authedRpcMock.mockReset();
});

describe("fetchAccountWishes", () => {
  it("갤러리 상대경로에 CDN 호스트를 붙인다 — 안 붙이면 상세가 첫 장만 보인다", async () => {
    authedRpcMock.mockResolvedValue([row]);

    const entries = await fetchAccountWishes();

    expect(entries[0].product.gallery).toEqual([
      "https://image.msscdn.net/images/prd_img/detail_1_500.jpg",
      "https://image.msscdn.net/images/prd_img/detail_2_500.jpg",
    ]);
  });

  it("갤러리가 없으면 빈 배열", async () => {
    authedRpcMock.mockResolvedValue([{ ...row, gallery: null }]);

    const entries = await fetchAccountWishes();

    expect(entries[0].product.gallery).toEqual([]);
  });
});
