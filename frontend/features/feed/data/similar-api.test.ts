import { describe, expect, it } from "vitest";

import { mapSimilarDto } from "@/features/feed/data/similar-api";

const dto = {
  goods_no: 42,
  title: "유사 티셔츠",
  brand_name: "브랜드",
  price_final: 25900,
  thumbnail: "https://image.msscdn.net/thumbnails/a.jpg",
  gender: "공용",
  gallery: ["/images/prd_img/g1.jpg", "/images/prd_img/g2.jpg"],
  width: 500,
  height: 620,
  slot: 2,
};

describe("mapSimilarDto", () => {
  it("매칭 슬롯의 갤러리 이미지를 matchedImage로 담는다 (CDN 절대 URL)", () => {
    const p = mapSimilarDto(dto);
    expect(p.matchedImage).toEqual({
      slot: 2,
      url: "https://image.msscdn.net/images/prd_img/g2.jpg",
    });
  });

  it("슬롯 0(썸네일 매칭)은 썸네일 URL을 담는다", () => {
    const p = mapSimilarDto({ ...dto, slot: 0 });
    expect(p.matchedImage?.url).toBe(dto.thumbnail);
  });

  it("width/height는 매칭 이미지 크기를 그대로 쓴다", () => {
    const p = mapSimilarDto(dto);
    expect(p.width).toBe(500);
    expect(p.height).toBe(620);
  });
});
