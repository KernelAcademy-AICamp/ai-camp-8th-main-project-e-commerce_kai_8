// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Product } from "@/features/feed/domain/product";
import { fetchSearchPage } from "@/features/feed/search/data/search-api";
import {
  type SearchFeedOptions,
  useSearchFeed,
} from "@/features/feed/search/presentation/view-model/use-search-feed";

// 첫 페이지는 자판 폴백 경로를 타므로 둘 다 세운다. 폴백은 원문 호출로 위임해
// 기존 단언(호출 인자·경합·오류 처리)이 그대로 의미를 갖게 한다.
vi.mock("@/features/feed/search/data/search-api", () => {
  const fetchSearchPage = vi.fn();
  return {
    fetchSearchPage,
    fetchSearchPageWithFallback: vi.fn(
      async (query: string, after: number | null, size: number) => ({
        products: (await fetchSearchPage(query, after, size)) as Product[],
        usedQuery: query,
      }),
    ),
  };
});

const fetchSearchPageMock = vi.mocked(fetchSearchPage);

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

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", ObserverStub);
  fetchSearchPageMock.mockReset();
});

// 훅의 sentinelRef를 실제 div에 연결하는 렌더 하네스 (use-feed-view-model.test 패턴)
function renderSearchFeed(initial: SearchFeedOptions) {
  const result = {
    current: null as ReturnType<typeof useSearchFeed> | null,
  };
  let currentOptions = initial;
  function Harness({ options }: { options: SearchFeedOptions }) {
    const viewModel = useSearchFeed(options);
    result.current = viewModel;
    return createElement("div", { ref: viewModel.sentinelRef });
  }
  const view = render(createElement(Harness, { options: currentOptions }));
  return {
    result: result as { current: ReturnType<typeof useSearchFeed> },
    setOptions: (next: SearchFeedOptions) => {
      currentOptions = next;
      view.rerender(createElement(Harness, { options: currentOptions }));
    },
  };
}

function goodsNos(result: { current: ReturnType<typeof useSearchFeed> }) {
  return result.current.columns
    .flat()
    .map((card) => card.product.goodsNo)
    .sort((a, b) => a - b);
}

describe("useSearchFeed", () => {
  it("제출된 검색어로 첫 페이지를 요청해 컬럼으로 만든다", async () => {
    fetchSearchPageMock
      .mockResolvedValueOnce([product(1), product(2)])
      .mockResolvedValue([]);
    const { result } = renderSearchFeed({ query: "나이키" });
    await waitFor(() => {
      expect(fetchSearchPageMock).toHaveBeenCalledWith("나이키", null, 30);
      expect(goodsNos(result)).toEqual([1, 2]);
    });
  });

  it("query가 null이면 아무것도 요청하지 않는다", () => {
    renderSearchFeed({ query: null });
    expect(fetchSearchPageMock).not.toHaveBeenCalled();
  });

  it("paused면 요청하지 않고, 풀리면 이어서 요청한다", async () => {
    fetchSearchPageMock.mockResolvedValueOnce([product(1)]).mockResolvedValue([]);
    const { result, setOptions } = renderSearchFeed({ query: "나이키", paused: true });
    expect(fetchSearchPageMock).not.toHaveBeenCalled();
    setOptions({ query: "나이키", paused: false });
    await waitFor(() => {
      expect(goodsNos(result)).toEqual([1]);
    });
  });

  it("다음 페이지는 마지막 goods_no 커서로 이어 요청한다", async () => {
    fetchSearchPageMock
      .mockResolvedValueOnce([product(1), product(2)])
      .mockResolvedValueOnce([product(3)])
      .mockResolvedValue([]);
    const { result } = renderSearchFeed({ query: "나이키" });
    await waitFor(() => {
      expect(fetchSearchPageMock).toHaveBeenCalledWith("나이키", 2, 30);
      expect(goodsNos(result)).toEqual([1, 2, 3]);
    });
  });

  it("A 제출 뒤 B를 제출하면 늦게 도착한 A 응답은 버린다", async () => {
    let resolveA: (products: Product[]) => void = () => undefined;
    const pendingA = new Promise<Product[]>((resolve) => (resolveA = resolve));
    fetchSearchPageMock.mockImplementationOnce(() => pendingA);
    fetchSearchPageMock.mockResolvedValueOnce([product(20)]).mockResolvedValue([]);

    const { result, setOptions } = renderSearchFeed({ query: "A" });
    await waitFor(() => {
      expect(fetchSearchPageMock).toHaveBeenCalledWith("A", null, 30);
    });
    setOptions({ query: "B" });
    await waitFor(() => {
      expect(goodsNos(result)).toEqual([20]);
    });
    resolveA([product(10)]);
    // A 응답이 B 결과에 섞이면 안 된다
    await waitFor(() => {
      expect(goodsNos(result)).toEqual([20]);
    });
  });

  it("요청 중 검색을 해제하면(query null) 응답을 버린다", async () => {
    let resolveA: (products: Product[]) => void = () => undefined;
    const pendingA = new Promise<Product[]>((resolve) => (resolveA = resolve));
    fetchSearchPageMock.mockImplementationOnce(() => pendingA);

    const { result, setOptions } = renderSearchFeed({ query: "A" });
    await waitFor(() => {
      expect(fetchSearchPageMock).toHaveBeenCalled();
    });
    setOptions({ query: null });
    resolveA([product(10)]);
    await waitFor(() => {
      expect(goodsNos(result)).toEqual([]);
    });
  });

  it("해제 후 같은 검색어를 재제출하면 이전 오류 상태가 되살아나지 않는다", async () => {
    fetchSearchPageMock
      .mockRejectedValueOnce(new Error("RPC 오류"))
      .mockResolvedValueOnce([product(1)])
      .mockResolvedValue([]);
    const { result, setOptions } = renderSearchFeed({ query: "A" });
    await waitFor(() => {
      expect(result.current.error).toBe(true);
    });
    setOptions({ query: null });
    setOptions({ query: "A" });
    // 이전 세션의 오류가 첫 로드를 막거나 화면에 남으면 안 된다
    await waitFor(() => {
      expect(result.current.error).toBe(false);
      expect(goodsNos(result)).toEqual([1]);
    });
  });

  it("해제 후 같은 검색어를 재제출하면 이전 진행 중 응답을 버리고 새로 요청한다", async () => {
    let resolveOld: (products: Product[]) => void = () => undefined;
    const pendingOld = new Promise<Product[]>((resolve) => (resolveOld = resolve));
    fetchSearchPageMock.mockImplementationOnce(() => pendingOld);
    fetchSearchPageMock.mockResolvedValueOnce([product(1)]).mockResolvedValue([]);

    const { result, setOptions } = renderSearchFeed({ query: "A" });
    await waitFor(() => {
      expect(fetchSearchPageMock).toHaveBeenCalledTimes(1);
    });
    setOptions({ query: null });
    setOptions({ query: "A" });
    // 새 세대의 요청이 처음 커서로 다시 나가야 한다 (이전 진행 중 요청을 새 것으로 오인 금지)
    await waitFor(() => {
      expect(fetchSearchPageMock).toHaveBeenNthCalledWith(2, "A", null, 30);
      expect(goodsNos(result)).toEqual([1]);
    });
    resolveOld([product(99)]);
    await waitFor(() => {
      expect(goodsNos(result)).toEqual([1]);
    });
  });

  it("실패하면 자동 재시도 없이 오류 상태가 되고, retry로만 다시 요청한다", async () => {
    fetchSearchPageMock
      .mockRejectedValueOnce(new Error("RPC 오류"))
      .mockResolvedValueOnce([product(1)])
      .mockResolvedValue([]);
    const { result } = renderSearchFeed({ query: "나이키" });
    await waitFor(() => {
      expect(result.current.error).toBe(true);
    });
    expect(fetchSearchPageMock).toHaveBeenCalledTimes(1);
    result.current.retry();
    await waitFor(() => {
      expect(result.current.error).toBe(false);
      expect(goodsNos(result)).toEqual([1]);
    });
  });

  it("결과가 비면 isEmpty가 된다", async () => {
    fetchSearchPageMock.mockResolvedValue([]);
    const { result } = renderSearchFeed({ query: "쟈갸모" });
    await waitFor(() => {
      expect(result.current.isEmpty).toBe(true);
      expect(result.current.showSkeleton).toBe(false);
    });
  });
});
