// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Curation, FOR_YOU_VISIBLE } from "@/features/curation/domain/curation";
import { useForYouOrder } from "@/features/curation/presentation/view-model/use-for-you-order";
import { clearGenderSetting, setGenderSetting } from "@/shared/gender/gender-setting";
import { readCurationViews } from "@/shared/profile/curation-views";

const summary = vi.hoisted(() => vi.fn());
const restSelect = vi.hoisted(() => vi.fn());
const rpcPost = vi.hoisted(() => vi.fn());

vi.mock("@/shared/signals/signals", () => ({ getFeedProfileSummary: summary }));
vi.mock("@/shared/supabase-rpc", () => ({ restSelect, rpcPost }));

/** 실제 curations.json에서 키·건수만 흉내 낸 목록 (규칙 파일은 진짜를 쓴다) */
const curations = [
  { key: "baseball_raglan", n: 2533 },
  { key: "running", n: 900 },
  { key: "blokecore", n: 1500 },
  { key: "dog_print", n: 1400 },
  { key: "cat_print", n: 1151 },
  { key: "surf", n: 800 },
  { key: "embroidery", n: 700 },
] as unknown as Curation[];

const keys = (list: Curation[]) => list.map((c) => c.key);

// jsdom에는 IntersectionObserver가 없다 — 관찰 즉시 보인 것으로 알리는 스텁
/* eslint-disable @typescript-eslint/no-empty-function --
   IntersectionObserver 인터페이스를 흉내내는 테스트 더블이라 본문이 필요 없다
   (use-search-feed.test.ts와 같은 스텁) */

/** 칸이 끝내 보이지 않은 방문 (BROWSE만 쓰다 끝난 경우) */
class HiddenObserverStub {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

class ObserverStub {
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(): void {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  // IntersectionObserver 인터페이스를 흉내내는 테스트 더블이라 본문이 필요 없다
  disconnect(): void {}
  unobserve(): void {}
}
/* eslint-enable @typescript-eslint/no-empty-function */

/** 칸이 화면에 있는 상태로 훅을 건다 */
function render(list: Curation[] = curations) {
  // 테스트에서만 ref를 직접 채운다 (실제로는 React가 칸의 div를 붙인다)
  const paneRef = { current: document.createElement("div") };
  return renderHook(() => useForYouOrder(list, paneRef));
}
const g = (gender: string) => ({ g: gender });

// 앞 테스트의 컴포넌트가 남아 있으면 성별 저장소 알림을 받아 다시 렌더된다 —
// 그 fixture에는 items가 없어 필터가 터진다.
afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", ObserverStub);
  localStorage.clear();
  clearGenderSetting();
  summary.mockReset();
  restSelect.mockReset();
  rpcPost.mockReset();
  // 벡터 점수는 기본으로 "앵커를 못 품"(0행) — 벡터를 보는 테스트만 따로 채운다
  rpcPost.mockResolvedValue([]);
});

describe("useForYouOrder", () => {
  it("비회원(요약 없음)은 기본 순서 그대로다 — 개인화인 척하지 않는다", () => {
    summary.mockReturnValue(null);
    const { result } = render();
    expect(keys(result.current)).toEqual(keys(curations));
    expect(restSelect).not.toHaveBeenCalled();
    expect(rpcPost).not.toHaveBeenCalled();
  });

  it("앵커가 없으면(콜드스타트) 기본 순서 그대로다", () => {
    summary.mockReturnValue({ longAnchors: [], sessionAnchors: [] });
    const { result } = render();
    expect(keys(result.current)).toEqual(keys(curations));
    expect(restSelect).not.toHaveBeenCalled();
    expect(rpcPost).not.toHaveBeenCalled();
  });

  it("고양이 티를 찜한 사람은 고양이 큐레이션이 맨 앞으로 온다", async () => {
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    const { result } = render();
    await waitFor(() => {
      expect(result.current[0].key).toBe("cat_print");
    });
    // 목록이 잘리지 않는다 — 뒤 묶음이 같은 배열을 쓴다
    expect(result.current).toHaveLength(curations.length);
  });

  it("제목은 한 번만 조회한다 — 두 번째 방문은 캐시로 즉시 정렬된다", async () => {
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    const first = render();
    await waitFor(() => {
      expect(first.result.current[0].key).toBe("cat_print");
    });

    const second = render();
    expect(second.result.current[0].key).toBe("cat_print");
    expect(restSelect).toHaveBeenCalledTimes(1);
  });

  it("조회가 실패해도 화면은 기본 순서로 살아 있다", async () => {
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 222, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockRejectedValue(new Error("서버 실패"));
    const { result } = render();
    await waitFor(() => {
      expect(restSelect).toHaveBeenCalled();
    });
    expect(keys(result.current)).toEqual(keys(curations));
  });

  it("성별이 잡히면 내 성별 상품만 남고, 얇아진 큐레이션은 빠진다", async () => {
    const withItems = [
      {
        key: "cat_print",
        n: 1151,
        items: [g("남성"), g("남성"), g("남성"), g("여성")],
      },
      { key: "running", n: 900, items: [g("여성"), g("여성"), g("공용")] },
    ] as unknown as Curation[];
    // 성별은 **설정**에서 온다 — 프로필의 행동 판정이 아니다.
    setGenderSetting("남성");
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
      gender: "여성", // 프로필에 반대 값이 남아 있어도 설정이 이겨야 한다
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    const { result } = render(withItems);
    await waitFor(() => {
      expect(keys(result.current)).toEqual(["cat_print"]);
    });
    expect(result.current[0].items).toHaveLength(3);
  });

  it("앵커가 없어도 성별 필터는 걸린다 — 방금 가입한 사람도 반대 성별을 안 본다", async () => {
    // 예전에는 앵커가 없으면 곧바로 되돌아가 성별 필터까지 건너뛰었다.
    const withItems = [
      {
        key: "cat_print",
        n: 1151,
        items: [g("남성"), g("남성"), g("남성"), g("여성")],
      },
      { key: "running", n: 900, items: [g("여성"), g("여성"), g("공용")] },
    ] as unknown as Curation[];
    setGenderSetting("남성");
    summary.mockReturnValue({ longAnchors: [], sessionAnchors: [], gender: null });
    const { result } = render(withItems);
    await waitFor(() => {
      expect(keys(result.current)).toEqual(["cat_print"]);
    });
    expect(result.current[0].items).toHaveLength(3);
  });

  it("성별이 미확정이면 아무것도 거르지 않는다 — 개인화인 척하지 않는다", async () => {
    const withItems = [
      { key: "cat_print", n: 1151, items: [g("남성"), g("여성"), g("공용")] },
    ] as unknown as Curation[];
    summary.mockReturnValue({ longAnchors: [], sessionAnchors: [], gender: null });
    const { result } = render(withItems);
    await waitFor(() => {
      expect(result.current[0].items).toHaveLength(3);
    });
  });

  it("제목을 못 받아도 벡터 점수만으로 순서가 난다", async () => {
    // 이 조각의 핵심 — 제목에 낱말이 없어도(또는 제목 조회가 실패해도) 이미지로 잡는다
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockRejectedValue(new Error("제목 조회 실패"));
    rpcPost.mockResolvedValue([
      { key: "embroidery", score: 0.9 },
      { key: "surf", score: 0.8 },
      { key: "running", score: 0.5 },
    ]);
    const { result } = render();
    await waitFor(() => {
      expect(result.current[0].key).toBe("embroidery");
    });
    expect(rpcPost).toHaveBeenCalledWith(
      "c_curation_rank",
      { p_session: [], p_long: [{ g: 111, w: 4 }] },
      expect.objectContaining({ timeoutMs: expect.any(Number) as number }),
    );
  });

  it("벡터 조회가 실패해도 키워드 순서가 그대로 남는다", async () => {
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    rpcPost.mockRejectedValue(new Error("서버 실패"));
    const { result } = render();
    await waitFor(() => {
      expect(result.current[0].key).toBe("cat_print");
    });
  });

  it("벡터가 0행이면(앵커를 못 품) 키워드 순서 그대로다", async () => {
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    rpcPost.mockResolvedValue([]);
    const { result } = render();
    await waitFor(() => {
      expect(result.current[0].key).toBe("cat_print");
    });
  });

  it("칸이 보이면 첫 화면 몫을 노출로 적는다 — 다음 방문에 점수가 깎일 재료", async () => {
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    render();
    await waitFor(() => {
      expect(Object.keys(readCurationViews())).toHaveLength(FOR_YOU_VISIBLE);
    });
    expect(readCurationViews().cat_print).toBe(1);
  });

  it("비회원은 노출도 적지 않는다 — 취향을 쌓지 않는다(O-37)", async () => {
    summary.mockReturnValue(null);
    render();
    await waitFor(() => {
      expect(readCurationViews()).toEqual({});
    });
  });

  it("BROWSE만 쓰다 끝난 방문은 세지 않는다 — 본 적 없는 큐레이션이 깎이면 안 된다", async () => {
    vi.stubGlobal("IntersectionObserver", HiddenObserverStub);
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    const { result } = render();
    await waitFor(() => {
      expect(result.current[0].key).toBe("cat_print");
    });
    expect(readCurationViews()).toEqual({});
  });

  it("키워드 근거로 걸린 큐레이션엔 이유 문구가 남는다", async () => {
    const withReason = curations.map((c) =>
      c.key === "cat_print" ? { ...c, reason: "고양이를 좋아해서" } : c,
    );
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    const { result } = render(withReason);
    await waitFor(() => {
      expect(result.current[0].key).toBe("cat_print");
    });
    expect(result.current[0].reason).toBe("고양이를 좋아해서");
  });

  it("벡터로만 걸리면 이유 문구가 없어진다 — 근거를 지어내지 않는다", async () => {
    const withReason = curations.map((c) =>
      c.key === "embroidery" ? { ...c, reason: "자수라서" } : c,
    );
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockRejectedValue(new Error("제목 조회 실패"));
    rpcPost.mockResolvedValue([
      { key: "embroidery", score: 0.9 },
      { key: "surf", score: 0.8 },
      { key: "running", score: 0.5 },
    ]);
    const { result } = render(withReason);
    await waitFor(() => {
      expect(result.current[0].key).toBe("embroidery");
    });
    expect(result.current[0].reason).toBeUndefined();
  });

  it("개인화가 안 걸리면(콜드스타트) 이유 문구도 없다", () => {
    const withReason = curations.map((c) =>
      c.key === "cat_print" ? { ...c, reason: "고양이를 좋아해서" } : c,
    );
    summary.mockReturnValue({ longAnchors: [], sessionAnchors: [] });
    const { result } = render(withReason);
    expect(result.current.find((c) => c.key === "cat_print")?.reason).toBeUndefined();
  });
});
