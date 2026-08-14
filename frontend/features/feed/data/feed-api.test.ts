import { describe, expect, it } from "vitest";

import { mapFeedDto } from "@/features/feed/data/feed-api";

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
