import { describe, expect, it } from "vitest";

import { metadata } from "./layout";

// 카톡·문자 미리보기 카드가 제대로 뜨는 데 필요한 것들.
// 그림 자체는 scripts/make-brand-assets.py가 홈 화면 로고에서 만든다.
describe("공유 카드 메타데이터", () => {
  it("상대 경로를 절대 주소로 바꿀 기준이 있다", () => {
    // 이게 없으면 Next가 localhost로 채워 카톡이 그림을 못 받는다
    expect(metadata.metadataBase).toBeInstanceOf(URL);
  });

  it("1200x630 카드 그림을 가리킨다", () => {
    const images = metadata.openGraph?.images;
    expect(Array.isArray(images)).toBe(true);
    const [first] = images as { url: string; width: number; height: number }[];
    expect(first.url).toBe("/og.png");
    expect(first.width).toBe(1200);
    expect(first.height).toBe(630);
  });

  it("제목·설명·한국어 로케일이 있다", () => {
    expect(metadata.openGraph?.title).toBe("aTee");
    expect(metadata.openGraph?.description).toBe("취향으로 변하는 티셔츠 무한 탐색");
    expect((metadata.openGraph as { locale?: string }).locale).toBe("ko_KR");
  });

  it("큰 그림 카드로 표시되게 한다", () => {
    // summary만 주면 작은 정사각 썸네일로 줄어든다
    expect((metadata.twitter as { card?: string }).card).toBe("summary_large_image");
  });
});
