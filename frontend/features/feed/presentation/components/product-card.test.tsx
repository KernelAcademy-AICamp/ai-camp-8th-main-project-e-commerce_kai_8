// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProductCard } from "@/features/feed/presentation/components/product-card";
import type { FeedCardViewData } from "@/features/feed/presentation/view-model/use-feed-view-model";

const card: FeedCardViewData = {
  feedKey: "1:0",
  rank: 0,
  product: {
    goodsNo: 1,
    title: "테스트 티셔츠",
    brandName: "브랜드",
    priceFinal: 14500,
    thumbnail: "https://image.msscdn.net/images/test_500.jpg",
    gender: null,
    width: 500,
    height: 600,
    gallery: [],
  },
  priceLabel: "14,500원",
  width: 500,
  height: 600,
};

describe("ProductCard", () => {
  afterEach(cleanup);

  it("이미지와 가격 배지를 그린다", () => {
    render(<ProductCard card={card} />);
    expect(screen.getByRole("img", { name: "테스트 티셔츠" })).toBeDefined();
    expect(screen.getByText("14,500원")).toBeDefined();
  });

  it("카드를 탭하면 선택 콜백에 상품이 전달된다", () => {
    let selected: string | null = null;
    render(
      <ProductCard
        card={card}
        onSelect={(picked) => {
          selected = picked.product.title;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(selected).toBe("테스트 티셔츠");
  });

  it("이미지 로드 실패 시 빈 화면 대신 대체 표시를 그린다", () => {
    render(<ProductCard card={card} />);
    fireEvent.error(screen.getByRole("img", { name: "테스트 티셔츠" }));
    expect(screen.getByText("이미지를 불러오지 못했어요")).toBeDefined();
  });
});
