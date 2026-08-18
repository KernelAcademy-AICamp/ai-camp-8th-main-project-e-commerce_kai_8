import { describe, expect, it } from "vitest";

import { type ColorImages, pickColorImage } from "./pick-color-image";

// byColor는 배치에서 썸네일색을 이미 제외한다(여기 없는 색 = 썸네일색이거나 사진없음).
const byColor: ColorImages = {
  화이트: { url: "u/white.jpg", src: "g4", status: "auto_high" },
  네이비: { url: "u/navy.jpg", src: "g1", status: "auto_high" },
  베이지: { url: "u/beige.jpg", src: "g7", status: "abstain" },
};

describe("pickColorImage", () => {
  it("의도 색과 일치하는 색의 이미지를 고른다", () => {
    expect(pickColorImage(byColor, ["화이트"], [])).toEqual({
      url: "u/white.jpg",
      color: "화이트",
    });
  });

  it("색 의도가 없으면 null(→ 기본 썸네일 유지)", () => {
    expect(pickColorImage(byColor, [], [])).toBeNull();
  });

  it("제외 색이면 교체하지 않는다", () => {
    expect(pickColorImage(byColor, ["화이트"], ["화이트"])).toBeNull();
  });

  it("byColor에 없는 색이면 null(썸네일색이거나 사진없음)", () => {
    expect(pickColorImage(byColor, ["오렌지"], [])).toBeNull();
  });

  it("신뢰 상태(auto_high/verified)가 아니면 교체하지 않는다", () => {
    expect(pickColorImage(byColor, ["베이지"], [])).toBeNull();
  });

  it("여러 의도 색이면 배열 순서(우선순위)대로 첫 매치를 고른다", () => {
    expect(pickColorImage(byColor, ["오렌지", "네이비"], [])).toEqual({
      url: "u/navy.jpg",
      color: "네이비",
    });
  });

  it("byColor가 없으면 null", () => {
    expect(pickColorImage(null, ["화이트"], [])).toBeNull();
  });
});
