import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMixPage, mapMixDto } from "@/features/feed/data/mix-api";
import { rpcPost } from "@/shared/supabase-rpc";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn() }));

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
  slot: 0,
  source_bucket: "diversity",
  is_fresh: null,
};

describe("mapMixDto", () => {
  it("믹스 응답을 domain Product로 바꾸고 유형·신선도를 싣는다", () => {
    const p = mapMixDto({ ...dto, source_bucket: "session", is_fresh: true });
    expect(p.goodsNo).toBe(123);
    expect(p.sourceBucket).toBe("session");
    expect(p.isFresh).toBe(true);
  });

  it("슬롯이 0보다 크면 매칭 이미지를 싣는다", () => {
    const p = mapMixDto({ ...dto, slot: 1 });
    expect(p.matchedImage?.slot).toBe(1);
  });

  it("슬롯이 0이면 매칭 이미지가 없다", () => {
    const p = mapMixDto({ ...dto, slot: 0 });
    expect(p.matchedImage).toBeUndefined();
  });
});

describe("fetchMixPage — 성별 하드 필터 (설계: 성별 피드 하드 필터 3단계)", () => {
  const baseRequest = {
    sessionAnchors: [{ goodsNo: 1, weight: 2 }],
    longAnchors: [{ goodsNo: 2, weight: 3 }],
    exclude: [9],
    seed: 1000,
    size: 30,
    boost: false,
  };

  it("성별을 주면 p_gender로 싣는다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...baseRequest, gender: "남성" });
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_mix_page",
      expect.objectContaining({ p_gender: "남성" }),
      { timeoutMs: 5_000 },
    );
  });

  it("성별이 null이면 p_gender도 null 그대로 싣는다 — 서버가 무시해 기존과 같은 동작", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...baseRequest, gender: null });
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_mix_page",
      expect.objectContaining({ p_gender: null }),
      { timeoutMs: 5_000 },
    );
  });

  it("나머지 페이로드는 기존과 동일하다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...baseRequest, gender: "여성" });
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_mix_page",
      {
        p_session: [{ g: 1, w: 2 }],
        p_long: [{ g: 2, w: 3 }],
        p_exclude: [9],
        p_seed: 1000,
        p_size: 30,
        p_boost: false,
        p_gender: "여성",
      },
      { timeoutMs: 5_000 },
    );
  });
});
