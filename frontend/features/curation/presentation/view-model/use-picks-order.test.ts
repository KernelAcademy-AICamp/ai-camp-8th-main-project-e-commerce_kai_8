// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Curation } from "@/features/curation/domain/curation";
import { usePicksOrder } from "@/features/curation/presentation/view-model/use-picks-order";

const summary = vi.hoisted(() => vi.fn());
const restSelect = vi.hoisted(() => vi.fn());

vi.mock("@/shared/signals/signals", () => ({ getFeedProfileSummary: summary }));
vi.mock("@/shared/supabase-rpc", () => ({ restSelect }));

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

beforeEach(() => {
  localStorage.clear();
  summary.mockReset();
  restSelect.mockReset();
});

describe("usePicksOrder", () => {
  it("비회원(요약 없음)은 기본 순서 그대로다 — 개인화인 척하지 않는다", () => {
    summary.mockReturnValue(null);
    const { result } = renderHook(() => usePicksOrder(curations));
    expect(keys(result.current)).toEqual(keys(curations));
    expect(restSelect).not.toHaveBeenCalled();
  });

  it("앵커가 없으면(콜드스타트) 기본 순서 그대로다", () => {
    summary.mockReturnValue({ longAnchors: [], sessionAnchors: [] });
    const { result } = renderHook(() => usePicksOrder(curations));
    expect(keys(result.current)).toEqual(keys(curations));
    expect(restSelect).not.toHaveBeenCalled();
  });

  it("고양이 티를 찜한 사람은 고양이 큐레이션이 맨 앞으로 온다", async () => {
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    const { result } = renderHook(() => usePicksOrder(curations));
    await waitFor(() => {
      expect(result.current[0].key).toBe("cat_print");
    });
    // 목록이 잘리지 않는다 — 더보기가 같은 배열을 쓴다
    expect(result.current).toHaveLength(curations.length);
  });

  it("제목은 한 번만 조회한다 — 두 번째 방문은 캐시로 즉시 정렬된다", async () => {
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 111, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockResolvedValue([{ goods_no: 111, title: "고양이 티셔츠" }]);
    const first = renderHook(() => usePicksOrder(curations));
    await waitFor(() => {
      expect(first.result.current[0].key).toBe("cat_print");
    });

    const second = renderHook(() => usePicksOrder(curations));
    expect(second.result.current[0].key).toBe("cat_print");
    expect(restSelect).toHaveBeenCalledTimes(1);
  });

  it("조회가 실패해도 화면은 기본 순서로 살아 있다", async () => {
    summary.mockReturnValue({
      longAnchors: [{ goodsNo: 222, weight: 4 }],
      sessionAnchors: [],
    });
    restSelect.mockRejectedValue(new Error("서버 실패"));
    const { result } = renderHook(() => usePicksOrder(curations));
    await waitFor(() => {
      expect(restSelect).toHaveBeenCalled();
    });
    expect(keys(result.current)).toEqual(keys(curations));
  });
});
