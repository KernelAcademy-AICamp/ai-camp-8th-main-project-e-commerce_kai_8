// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchFeedPage } from "@/features/feed/data/feed-api";
import { deriveSeed } from "@/features/feed/domain/derive-seed";
import type { Product } from "@/features/feed/domain/product";
import {
  type FeedOptions,
  useFeedViewModel,
} from "@/features/feed/presentation/view-model/use-feed-view-model";

vi.mock("@/features/feed/data/feed-api", () => ({ fetchFeedPage: vi.fn() }));
vi.mock("@/features/feed/data/session-seed", () => ({
  getSessionSeed: () => 1000,
}));

const product = (goodsNo: number): Product => ({
  goodsNo,
  title: `상품 ${String(goodsNo)}`,
  brandName: null,
  priceFinal: 10000,
  thumbnail: `https://example.com/${String(goodsNo)}.jpg`,
  gender: null,
  width: 500,
  height: 600,
  gallery: [],
});

// jsdom에는 IntersectionObserver가 없다 — 관찰 즉시 교차한 것으로 알리는 스텁
class ObserverStub {
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  // IntersectionObserver 인터페이스를 흉내내는 테스트 더블이라 본문이 필요 없다
  /* eslint-disable @typescript-eslint/no-empty-function */
  disconnect() {}
  unobserve() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
}

const fetchFeedPageMock = vi.mocked(fetchFeedPage);

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", ObserverStub);
  fetchFeedPageMock.mockReset();
});

// renderHook은 훅을 실제 DOM에 붙이지 않아 sentinelRef.current가 계속 null로 남고,
// 그러면 useEffect가 관찰자를 만들지 않아 최초 로드가 절대 일어나지 않는다.
// 실제 화면처럼 반환된 sentinelRef를 div에 연결하는 얇은 렌더 하네스를 쓴다.
function renderFeedViewModel(options?: FeedOptions) {
  const result = {
    current: null as ReturnType<typeof useFeedViewModel> | null,
  };
  function Harness() {
    const viewModel = useFeedViewModel(options);
    result.current = viewModel;
    return createElement("div", { ref: viewModel.sentinelRef });
  }
  render(createElement(Harness));
  return { result: result as { current: ReturnType<typeof useFeedViewModel> } };
}

describe("useFeedViewModel", () => {
  it("기본은 세션 시드로 요청한다", async () => {
    fetchFeedPageMock.mockResolvedValue([]);
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30);
    });
  });

  it("exploreFrom을 주면 파생 시드로 요청하고 해당 상품은 제외한다", async () => {
    fetchFeedPageMock
      .mockResolvedValueOnce([product(7), product(8)])
      .mockResolvedValue([]);
    const { result } = renderFeedViewModel({ exploreFrom: 7 });
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(deriveSeed(1000, 7), null, 30);
    });
    await waitFor(() => {
      const goodsNos = result.current.columns
        .flat()
        .map((card) => card.product.goodsNo);
      expect(goodsNos).toEqual([8]);
    });
  });
});
