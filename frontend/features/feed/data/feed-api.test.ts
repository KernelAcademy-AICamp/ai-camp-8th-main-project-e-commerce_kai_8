import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchFeedPage, mapFeedDto } from "@/features/feed/data/feed-api";
import { rpcPost } from "@/shared/supabase-rpc";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn(), restSelect: vi.fn() }));

const rpcPostMock = vi.mocked(rpcPost);

beforeEach(() => {
  rpcPostMock.mockReset();
});

const dto = {
  goods_no: 123,
  title: "테스트 티셔츠",
  brand_name: "브랜드",
  price_final: 19900,
  thumbnail: "https://image.msscdn.net/thumbnails/a.jpg",
  gender: "공용",
  gallery: ["/images/prd_img/b_500.jpg"],
  width: 500,
  height: 600,
};

describe("mapFeedDto", () => {
  it("snake_case 응답을 domain Product로 바꾼다", () => {
    const p = mapFeedDto(dto);
    expect(p.goodsNo).toBe(123);
    expect(p.brandName).toBe("브랜드");
    expect(p.priceFinal).toBe(19900);
    expect(p.width).toBe(500);
    expect(p.height).toBe(600);
  });

  it("갤러리 상대경로에 CDN 도메인을 붙인다", () => {
    const p = mapFeedDto(dto);
    expect(p.gallery).toEqual(["https://image.msscdn.net/images/prd_img/b_500.jpg"]);
  });

  it("이미 절대 URL인 갤러리는 그대로 둔다", () => {
    const p = mapFeedDto({ ...dto, gallery: ["https://image.msscdn.net/x.jpg"] });
    expect(p.gallery).toEqual(["https://image.msscdn.net/x.jpg"]);
  });

  it("제목이 없으면 기본 제목을 쓴다", () => {
    const p = mapFeedDto({ ...dto, title: null });
    expect(p.title).toBe("티셔츠");
  });
});

describe("fetchFeedPage — 성별 하드 필터 (설계: 성별 피드 하드 필터 3단계)", () => {
  it("성별을 주면 p_gender로 싣는다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchFeedPage(1000, null, 30, "여성");
    expect(rpcPostMock).toHaveBeenCalledWith("c_feed_page", {
      p_seed: 1000,
      p_after: null,
      p_size: 30,
      p_gender: "여성",
    });
  });

  it("남성도 대칭으로 싣는다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchFeedPage(1000, null, 30, "남성");
    expect(rpcPostMock).toHaveBeenCalledWith("c_feed_page", {
      p_seed: 1000,
      p_after: null,
      p_size: 30,
      p_gender: "남성",
    });
  });

  // 성별을 생략하는 호출은 **타입에서 막힌다**(인자가 필수다). 예전에는 생략하면
  // null이 실려 서버가 필터를 껐는데, 공용까지 빼는 정책에서는 그것이 곧 필터가
  // 조용히 꺼지는 실패다 — 그래서 생략 자체를 없앴다.
});
