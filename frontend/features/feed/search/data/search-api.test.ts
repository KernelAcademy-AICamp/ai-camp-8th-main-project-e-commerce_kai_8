import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSearchPage } from "@/features/feed/search/data/search-api";
import { rpcPost } from "@/shared/supabase-rpc";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn() }));

const rpcPostMock = vi.mocked(rpcPost);

const dto = {
  goods_no: 123,
  title: "나이키 반팔 티셔츠",
  brand_name: "나이키",
  price_final: 29900,
  thumbnail: "https://image.msscdn.net/thumbnails/a.jpg",
  gender: "공용",
  gallery: ["/images/prd_img/b_500.jpg"],
  width: 500,
  height: 600,
};

beforeEach(() => {
  rpcPostMock.mockReset();
});

describe("fetchSearchPage", () => {
  it("c_search_page RPC를 검색어·커서·크기로 호출한다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchSearchPage("나이키 반팔", 456, 30);
    expect(rpcPostMock).toHaveBeenCalledWith("c_search_page", {
      p_query: "나이키 반팔",
      p_after: 456,
      p_size: 30,
    });
  });

  it("응답을 기존 피드와 같은 매핑으로 Product로 바꾼다 (CDN 접두 포함)", async () => {
    rpcPostMock.mockResolvedValue([dto]);
    const products = await fetchSearchPage("나이키", null, 30);
    expect(products).toHaveLength(1);
    expect(products[0].goodsNo).toBe(123);
    expect(products[0].brandName).toBe("나이키");
    expect(products[0].gallery).toEqual([
      "https://image.msscdn.net/images/prd_img/b_500.jpg",
    ]);
  });
});
