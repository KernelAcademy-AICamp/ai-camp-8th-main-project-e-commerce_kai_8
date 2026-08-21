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
import { RpcError } from "@/shared/rpc-error";
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

/** c_mix_page 응답 한 페이지. 커서는 **문자열**이다(정밀도 — mix-api.ts 주석). */
const mixPage = (
  products: Product[],
  cursor: { hk: string; no: string } | null = null,
  exhausted = false,
) => ({ products, cursor, exhausted });

// jsdom에는 IntersectionObserver가 없다 — 관찰 즉시 교차한 것으로 알리는 스텁
// 가장 최근에 걸린 관찰 콜백 — 테스트가 "바닥에 닿았다"를 다시 알릴 때 쓴다.
let lastCallback: IntersectionObserverCallback | null = null;

// 훅은 콜백의 두 번째 인자(관찰자 자신)를 쓰지 않는다. 스텁이 넘기는 자리 표시.
const OBSERVER_ARG = {} as IntersectionObserver;
const INTERSECTING = [{ isIntersecting: true } as IntersectionObserverEntry];

class ObserverStub {
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    lastCallback = callback;
  }
  observe() {
    this.callback(INTERSECTING, OBSERVER_ARG);
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
  lastCallback = null;
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

/** 무한 스크롤 바닥에 닿은 것으로 알려 다음 페이지를 부른다. */
function scrollToBottom() {
  lastCallback?.(INTERSECTING, OBSERVER_ARG);
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
    fetchMixPageMock.mockResolvedValue(mixPage([]));
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

describe("오류 분류 (계획 6단계 — 무한 재시도와 헛된 폴백을 막는다)", () => {
  it("계약 오류(400)면 무작위 폴백도 하지 않고 실패를 드러낸다", async () => {
    setGenderSetting("여성");
    getFeedProfileSummaryMock.mockReturnValue({
      schemaVersion: 2,
      longAnchors: [{ goodsNo: 1, weight: 5 }],
      sessionAnchors: [],
      recentImpressions: [],
      boostActive: false,
      gender: null,
    });
    fetchMixPageMock.mockRejectedValue(new RpcError("잘못된 인자", 400));
    const { result: view } = renderFeedViewModel();

    await waitFor(() => {
      expect(view.current.failed).toBe(true);
    });
    // 폴백을 안 해야 한다 — 무작위도 같은 인자로 거부된다
    expect(fetchFeedPageMock).not.toHaveBeenCalled();
    expect(view.current.showSkeleton).toBe(false); // 스켈레톤을 붙잡지 않는다
  });

  it("서버 오류(500)면 무작위로 폴백한다", async () => {
    setGenderSetting("여성");
    getFeedProfileSummaryMock.mockReturnValue({
      schemaVersion: 2,
      longAnchors: [{ goodsNo: 1, weight: 5 }],
      sessionAnchors: [],
      recentImpressions: [],
      boostActive: false,
      gender: null,
    });
    fetchMixPageMock.mockRejectedValue(new RpcError("서버 오류", 500));
    fetchFeedPageMock.mockResolvedValue([product(1)]);
    renderFeedViewModel();

    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalledWith(1000, null, 30, "여성");
    });
  });

  it("계약 오류를 만나면 자동 재시도를 하지 않는다", async () => {
    setGenderSetting("남성");
    fetchFeedPageMock.mockRejectedValue(new RpcError("잘못된 인자", 400));
    const { result: view } = renderFeedViewModel();

    await waitFor(() => {
      expect(view.current.failed).toBe(true);
    });
    const callsAfterFail = fetchFeedPageMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 80));
    expect(fetchFeedPageMock.mock.calls.length).toBe(callsAfterFail);
  });

  it("다시 시도를 누르면 한 번 더 부른다", async () => {
    setGenderSetting("남성");
    fetchFeedPageMock.mockRejectedValue(new RpcError("잘못된 인자", 400));
    const { result: view } = renderFeedViewModel();
    await waitFor(() => {
      expect(view.current.failed).toBe(true);
    });

    fetchFeedPageMock.mockResolvedValue([product(3)]);
    view.current.retry();
    await waitFor(() => {
      expect(view.current.failed).toBe(false);
      expect(view.current.columns.flat().map((c) => c.product.goodsNo)).toEqual([3]);
    });
  });
});

describe("useFeedViewModel — 후보풀 커서 (계획 2026-08-22-feed-depth-cursor 3단계)", () => {
  const BIG_NEG = "-9174854730392098679";
  const BIG_POS = "9223187735554687845";
  const anchored = (): ProfileSummary => ({
    schemaVersion: 2,
    longAnchors: [{ goodsNo: 1, weight: 5 }],
    sessionAnchors: [],
    recentImpressions: [],
    boostActive: false,
    gender: null,
  });

  beforeEach(() => {
    setGenderSetting("남성");
    getFeedProfileSummaryMock.mockReturnValue(anchored());
  });

  it("첫 요청에는 커서를 안 싣는다", async () => {
    fetchMixPageMock.mockResolvedValue(mixPage([product(1)]));
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchMixPageMock).toHaveBeenCalledWith(
        expect.objectContaining({ after: null }),
      );
    });
  });

  it("받은 커서를 다음 요청에 **문자열 그대로** 싣는다", async () => {
    fetchMixPageMock.mockResolvedValue(
      mixPage([product(1)], { hk: BIG_NEG, no: "6393200" }),
    );
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchMixPageMock).toHaveBeenCalledTimes(1);
    });
    scrollToBottom();
    await waitFor(() => {
      expect(fetchMixPageMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ after: { hk: BIG_NEG, no: "6393200" } }),
      );
    });
  });

  it("응답에 커서가 없으면 들고 있던 값을 유지한다", async () => {
    // 1번째 응답이 커서를 주고, 그 뒤로는 계속 빈 응답(커서 없음)이다.
    // 커서를 버리면 이후 요청이 after: null로 나가 처음부터 다시 받는다.
    fetchMixPageMock
      .mockResolvedValue(mixPage([], null))
      .mockResolvedValueOnce(mixPage([product(1)], { hk: BIG_POS, no: "7" }));
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchMixPageMock.mock.calls.length).toBeGreaterThan(1);
    });
    scrollToBottom();
    await waitFor(() => {
      expect(fetchMixPageMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ after: { hk: BIG_POS, no: "7" } }),
      );
    });
    // 첫 요청을 뺀 모든 요청이 그 커서를 들고 있다.
    const laterCalls = fetchMixPageMock.mock.calls.slice(1);
    expect(laterCalls.length).toBeGreaterThan(0);
    for (const [request] of laterCalls) {
      expect(request.after).toEqual({ hk: BIG_POS, no: "7" });
    }
  });

  it("소진 신호를 받으면 개인화를 그만두고 무작위로 넘어간다", async () => {
    fetchMixPageMock.mockResolvedValue(
      mixPage([product(1)], { hk: BIG_POS, no: "7" }, true),
    );
    fetchFeedPageMock.mockResolvedValue([product(2)]);
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchMixPageMock).toHaveBeenCalledTimes(1);
    });
    scrollToBottom();
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalled();
    });
    // 소진 뒤에는 개인화를 다시 부르지 않는다 — 불러 봐야 커서를 밀 곳이 없다.
    expect(fetchMixPageMock).toHaveBeenCalledTimes(1);
  });

  it("성별이 바뀌면 커서와 소진 상태를 모두 버린다", async () => {
    fetchMixPageMock.mockResolvedValue(
      mixPage([product(1)], { hk: BIG_POS, no: "7" }, true),
    );
    fetchFeedPageMock.mockResolvedValue([product(2)]);
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchMixPageMock).toHaveBeenCalledTimes(1);
    });
    fetchMixPageMock.mockResolvedValue(mixPage([product(3)]));
    setGenderSetting("여성");
    await waitFor(() => {
      // 소진이 풀려 개인화를 다시 시도하고, 커서 없이 처음부터 간다.
      expect(fetchMixPageMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ gender: "여성", after: null }),
      );
    });
  });

  it("무작위 경로에는 믹스 해시 커서가 실려 나가지 않는다", async () => {
    // 무작위는 상품번호 커서를 쓴다. 둘을 섞으면 무작위에 해시를 보내게 된다.
    fetchMixPageMock.mockResolvedValue(
      mixPage([product(1)], { hk: BIG_NEG, no: "6393200" }, true),
    );
    fetchFeedPageMock.mockResolvedValue([product(2)]);
    renderFeedViewModel();
    await waitFor(() => {
      expect(fetchMixPageMock).toHaveBeenCalledTimes(1);
    });
    scrollToBottom();
    await waitFor(() => {
      expect(fetchFeedPageMock).toHaveBeenCalled();
    });
    const after = fetchFeedPageMock.mock.calls[0]?.[1];
    // 무작위 커서는 상품번호(정수)이거나 null이다 — 해시 문자열이 오면 안 된다.
    expect(typeof after).not.toBe("string");
  });
});
