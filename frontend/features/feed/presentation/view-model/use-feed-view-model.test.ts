// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchFeedPage } from "@/features/feed/data/feed-api";
import { fetchMixPage } from "@/features/feed/data/mix-api";
import { fetchSimilarPage } from "@/features/feed/data/similar-api";
import { deriveSeed } from "@/features/feed/domain/derive-seed";
import type { Product } from "@/features/feed/domain/product";
import {
  type FeedOptions,
  useFeedViewModel,
} from "@/features/feed/presentation/view-model/use-feed-view-model";
import { clearGenderSetting, setGenderSetting } from "@/shared/gender/gender-setting";
import type { ProfileSummary } from "@/shared/profile/profile-store";
import { getFeedProfileSummary } from "@/shared/signals/signals";

vi.mock("@/features/feed/data/feed-api", () => ({ fetchFeedPage: vi.fn() }));
vi.mock("@/features/feed/data/mix-api", () => ({ fetchMixPage: vi.fn() }));
vi.mock("@/features/feed/data/similar-api", () => ({ fetchSimilarPage: vi.fn() }));
vi.mock("@/features/feed/data/session-seed", () => ({
  getSessionSeed: () => 1000,
}));
vi.mock("@/shared/signals/signals", () => ({
  getFeedProfileSummary: vi.fn(),
  logImpression: vi.fn(),
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
const fetchMixPageMock = vi.mocked(fetchMixPage);
const fetchSimilarPageMock = vi.mocked(fetchSimilarPage);
const getFeedProfileSummaryMock = vi.mocked(getFeedProfileSummary);

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", ObserverStub);
  // 성별이 정해져 있어야 훅이 요청을 보낸다 — 미확정이면 멈춰 있는 것이 계약이다.
  // 그 계약 자체는 아래 "성별 미확정" describe에서 따로 검증한다.
  localStorage.clear();
  clearGenderSetting();
  setGenderSetting("여성");
  fetchFeedPageMock.mockReset();
  fetchMixPageMock.mockReset();
  fetchSimilarPageMock.mockReset();
  getFeedProfileSummaryMock.mockReset();
  // 기존 테스트는 전부 비회원·콜드스타트를 전제한다 — 실제 signals.ts도
  // 로그인하지 않았으면 null을 돌려준다 (O-37)
  getFeedProfileSummaryMock.mockReturnValue(null);
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
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30, "여성");
    });
  });

  it("similarFirst면 첫 페이지는 유사 상품, 다음 페이지는 무작위로 이어간다", async () => {
    fetchSimilarPageMock.mockResolvedValue([product(21), product(22)]);
    fetchFeedPageMock
      .mockResolvedValueOnce([product(22), product(23)])
      .mockResolvedValue([]);
    const { result } = renderFeedViewModel({ exploreFrom: 7, similarFirst: true });
    await waitFor(() => {
      expect(fetchSimilarPageMock).toHaveBeenCalledWith(7, 16, "여성");
    });
    // 이어지는 무작위 페이지는 커서 처음(null)부터, 이미 보인 22는 중복 제거
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(
        deriveSeed(1000, 7),
        null,
        30,
        "여성",
      );
      const goodsNos = result.current.columns
        .flat()
        .map((card) => card.product.goodsNo)
        .sort((a, b) => a - b);
      expect(goodsNos).toEqual([21, 22, 23]);
    });
  });

  it("유사 상품 로드가 실패하면 무작위 피드로 폴백한다", async () => {
    fetchSimilarPageMock.mockRejectedValue(new Error("RPC 오류"));
    fetchFeedPageMock.mockResolvedValueOnce([product(31)]).mockResolvedValue([]);
    const { result } = renderFeedViewModel({ exploreFrom: 7, similarFirst: true });
    await waitFor(() => {
      const goodsNos = result.current.columns
        .flat()
        .map((card) => card.product.goodsNo);
      expect(goodsNos).toEqual([31]);
    });
  });

  it("exploreFrom을 주면 파생 시드로 요청하고 해당 상품은 제외한다", async () => {
    fetchFeedPageMock
      .mockResolvedValueOnce([product(7), product(8)])
      .mockResolvedValue([]);
    const { result } = renderFeedViewModel({ exploreFrom: 7 });
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(
        deriveSeed(1000, 7),
        null,
        30,
        "여성",
      );
    });
    await waitFor(() => {
      const goodsNos = result.current.columns
        .flat()
        .map((card) => card.product.goodsNo);
      expect(goodsNos).toEqual([8]);
    });
  });
});

describe("useFeedViewModel — 우세 성별 하드 필터 (설계: 성별 피드 하드 필터 3단계)", () => {
  const summary = (overrides: Partial<ProfileSummary> = {}): ProfileSummary => ({
    schemaVersion: 2,
    longAnchors: [{ goodsNo: 1, weight: 5 }],
    sessionAnchors: [],
    recentImpressions: [],
    boostActive: false,
    gender: null,
    ...overrides,
  });

  it("개인화 요청에 **설정** 성별을 보낸다 — 프로필의 옛 판정이 아니라", async () => {
    // #63은 행동으로 성별을 추론했다. 이제 진실은 사람이 고른 설정 하나다.
    // 프로필에 반대 성별이 남아 있어도 설정이 이겨야 한다.
    setGenderSetting("남성");
    getFeedProfileSummaryMock.mockReturnValue(summary({ gender: "여성" }));
    fetchMixPageMock.mockResolvedValue([]);
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchMixPageMock).toHaveBeenCalledWith(
        expect.objectContaining({ gender: "남성" }),
      );
    });
  });

  it("개인화 실패 시 폴백 요청에도 같은 설정 성별이 실린다", async () => {
    setGenderSetting("여성");
    fetchMixPageMock.mockRejectedValue(new Error("RPC 오류"));
    fetchFeedPageMock.mockResolvedValue([]);
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30, "여성");
    });
  });

  it("앵커가 없는 콜드스타트도 설정 성별로 무작위 요청한다", async () => {
    // 예전에는 여기서 성별 없이(널) 나갔다 — 첫 페이지에 반대 성별이 섞이던 자리다.
    setGenderSetting("남성");
    getFeedProfileSummaryMock.mockReturnValue(
      summary({ longAnchors: [], sessionAnchors: [] }),
    );
    fetchFeedPageMock.mockResolvedValue([]);
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchMixPageMock).not.toHaveBeenCalled();
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30, "남성");
    });
  });

  it("explore 이어받기(2페이지 이후)에도 설정 성별이 실린다 — 회귀", async () => {
    setGenderSetting("남성");
    fetchFeedPageMock.mockResolvedValue([]);
    renderFeedViewModel({ exploreFrom: 7 });
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(
        deriveSeed(1000, 7),
        null,
        30,
        "남성",
      );
    });
  });

  it("유사 첫 요청과 0건 폴백 모두에 설정 성별이 실린다 — 회귀", async () => {
    setGenderSetting("여성");
    fetchSimilarPageMock.mockResolvedValue([]);
    fetchFeedPageMock.mockResolvedValue([]);
    renderFeedViewModel({ exploreFrom: 7, similarFirst: true });
    await waitFor(() => {
      expect(fetchSimilarPageMock).toHaveBeenCalledWith(7, 16, "여성");
      expect(fetchFeedPageMock).toHaveBeenCalledWith(
        deriveSeed(1000, 7),
        null,
        30,
        "여성",
      );
    });
  });
});

describe("성별 미확정 (계획 2단계 — 고르기 전에는 아무 요청도 안 나간다)", () => {
  it("성별이 없으면 첫 페이지를 부르지 않는다", async () => {
    clearGenderSetting();
    localStorage.clear();
    renderFeedViewModel();
    // 마운트 즉시 도는 로드가 있으므로, 잠깐 기다렸다가 호출이 없음을 본다
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchFeedPageMock).not.toHaveBeenCalled();
    expect(fetchMixPageMock).not.toHaveBeenCalled();
  });

  it("성별이 정해지면 그때 첫 페이지를 부른다", async () => {
    clearGenderSetting();
    localStorage.clear();
    fetchFeedPageMock.mockResolvedValue([product(1)]);
    renderFeedViewModel();
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchFeedPageMock).not.toHaveBeenCalled();

    setGenderSetting("남성");
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30, "남성");
    });
  });
});

describe("성별 변경 (계획 4단계 — 세대를 갈아엎는다)", () => {
  it("성별을 바꾸면 이전 결과를 버리고 새 성별로 처음부터 받는다", async () => {
    setGenderSetting("여성");
    fetchFeedPageMock.mockResolvedValue([product(1), product(2)]);
    const { result: view } = renderFeedViewModel();
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30, "여성");
    });

    fetchFeedPageMock.mockResolvedValue([product(9)]);
    setGenderSetting("남성");
    await waitFor(() => {
      // 커서 없이(null) 다시 시작한다 — 이어받으면 옛 성별의 자리에서 이어진다
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30, "남성");
    });
    await waitFor(() => {
      const shown = view.current.columns.flat().map((c) => c.product.goodsNo);
      expect(shown).toEqual([9]); // 이전 성별 상품이 남아 있지 않다
    });
  });

  it("성별을 바꾼 뒤 늦게 도착한 이전 성별 응답은 목록에 섞이지 않는다", async () => {
    setGenderSetting("여성");
    let releaseOld: (v: Product[]) => void = () => undefined;
    fetchFeedPageMock.mockReturnValueOnce(
      new Promise<Product[]>((resolve) => {
        releaseOld = resolve;
      }),
    );
    const { result: view } = renderFeedViewModel();
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30, "여성");
    });

    fetchFeedPageMock.mockResolvedValue([product(7)]);
    setGenderSetting("남성");
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30, "남성");
    });

    releaseOld([product(100), product(101)]); // 옛 성별 응답이 이제 도착
    await new Promise((r) => setTimeout(r, 30));
    const shown = view.current.columns.flat().map((c) => c.product.goodsNo);
    expect(shown).not.toContain(100);
    expect(shown).not.toContain(101);
  });
});
