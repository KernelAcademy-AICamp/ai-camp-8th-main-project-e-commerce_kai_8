import { describe, expect, it, vi } from "vitest";

import type { Goods } from "@/features/catalog/domain/goods";
import { searchRemote } from "@/features/search/data/search-remote";
import { EMPTY_INTENT } from "@/features/search/domain/query-intent";

function res(json: unknown): Response {
  return { ok: true, json: () => Promise.resolve(json) } as never;
}

describe("searchRemote — mode 계약", () => {
  it("빈 쿼리는 failed 빈 결과(요청 없이)", async () => {
    const r = await searchRemote("  ");
    expect(r).toEqual({
      results: [],
      intent: EMPTY_INTENT,
      mode: "failed",
      titleTier: null,
      titleSalvage: false,
      titleDropped: false,
      colorwayChips: [],
      semanticShadow: null,
    });
  });

  it("full 응답을 그대로 전달", async () => {
    const goods = [{ goodsNo: 1 }] as unknown as Goods[];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(res({ results: goods, intent: EMPTY_INTENT, mode: "full" }));
    const r = await searchRemote("검정 티", { fetchFn: fetchMock as typeof fetch });
    expect(r.mode).toBe("full");
    expect(r.results).toHaveLength(1);
  });

  it("lexical_only는 결과를 버리지 않는다", async () => {
    const goods = [{ goodsNo: 1 }] as unknown as Goods[];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        res({ results: goods, intent: EMPTY_INTENT, mode: "lexical_only" }),
      );
    const r = await searchRemote("나이키", { fetchFn: fetchMock as typeof fetch });
    expect(r.mode).toBe("lexical_only");
    expect(r.results).toHaveLength(1);
  });

  it("failed 응답은 빈 결과", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(res({ results: [], intent: EMPTY_INTENT, mode: "failed" }));
    const r = await searchRemote("아무말", { fetchFn: fetchMock as typeof fetch });
    expect(r).toEqual({
      results: [],
      intent: EMPTY_INTENT,
      mode: "failed",
      titleTier: null,
      titleSalvage: false,
      titleDropped: false,
      colorwayChips: [],
      semanticShadow: null,
    });
  });

  it("네트워크 오류 → failed", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("net"));
    const r = await searchRemote("x", { fetchFn: fetchMock as typeof fetch });
    expect(r.mode).toBe("failed");
  });

  it("mode가 없는 비정상 응답 → failed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ results: [] }));
    const r = await searchRemote("x", { fetchFn: fetchMock as typeof fetch });
    expect(r.mode).toBe("failed");
  });
  it("titleTier를 패스스루한다(없으면 null)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        res({ results: [], intent: EMPTY_INTENT, mode: "full", titleTier: "and" }),
      );
    const r = await searchRemote("드라이핏", { fetchFn: fetchMock as typeof fetch });
    expect(r.titleTier).toBe("and");
  });

  it("titleSalvage를 패스스루한다(없으면 false)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        res({ results: [], intent: EMPTY_INTENT, mode: "full", titleSalvage: true }),
      );
    const r = await searchRemote("택티컬 티셔츠", {
      fetchFn: fetchMock as typeof fetch,
    });
    expect(r.titleSalvage).toBe(true);

    const fetchMockNoField = vi
      .fn()
      .mockResolvedValue(res({ results: [], intent: EMPTY_INTENT, mode: "full" }));
    const r2 = await searchRemote("드라이핏", {
      fetchFn: fetchMockNoField as typeof fetch,
    });
    expect(r2.titleSalvage).toBe(false);
  });

  it("titleDropped를 패스스루한다(없으면 false)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        res({ results: [], intent: EMPTY_INTENT, mode: "full", titleDropped: true }),
      );
    const r = await searchRemote("저기 그거 있나요", {
      fetchFn: fetchMock as typeof fetch,
    });
    expect(r.titleDropped).toBe(true);

    const fetchMockNoField = vi
      .fn()
      .mockResolvedValue(res({ results: [], intent: EMPTY_INTENT, mode: "full" }));
    const r2 = await searchRemote("드라이핏", {
      fetchFn: fetchMockNoField as typeof fetch,
    });
    expect(r2.titleDropped).toBe(false);
  });
});
