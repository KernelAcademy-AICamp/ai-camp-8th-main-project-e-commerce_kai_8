import { describe, expect, it } from "vitest";

import { toGalleryUrls } from "@/features/feed/domain/image-url";

describe("toGalleryUrls", () => {
  it("상대경로에 CDN 호스트를 붙인다", () => {
    expect(
      toGalleryUrls(["/images/prd_img/20260521/6525463/detail_1_500.jpg"]),
    ).toEqual([
      "https://image.msscdn.net/images/prd_img/20260521/6525463/detail_1_500.jpg",
    ]);
  });

  it("이미 절대 URL이면 그대로 둔다 — 두 번 붙이지 않는다", () => {
    const absolute = "https://image.msscdn.net/images/prd_img/a.jpg";
    expect(toGalleryUrls([absolute])).toEqual([absolute]);
  });

  it("상대·절대가 섞여 있어도 각각 처리한다", () => {
    expect(
      toGalleryUrls(["/images/a.jpg", "https://image.msscdn.net/images/b.jpg"]),
    ).toEqual([
      "https://image.msscdn.net/images/a.jpg",
      "https://image.msscdn.net/images/b.jpg",
    ]);
  });

  it("빈 목록은 빈 목록", () => {
    expect(toGalleryUrls([])).toEqual([]);
  });
});
