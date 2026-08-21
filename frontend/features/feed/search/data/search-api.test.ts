import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSearchPage } from "@/features/feed/search/data/search-api";
import { rpcPost } from "@/shared/supabase-rpc";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn() }));

const rpcPostMock = vi.mocked(rpcPost);

const dto = {
  goods_no: 123,
  title: "나이키 반팔 티셔츠",
  brand_name: "나이키",
  price_final: 29900,
  thumbnail: "https://image.msscdn.net/thumbnails/a.jpg",
  gender: "공용",
  gallery: ["/images/prd_img/b_500.jpg"],
  width: 500,
  height: 600,
};

beforeEach(() => {
  rpcPostMock.mockReset();
  // v2는 명시적 opt-in이다 — 기본은 구 경로
  vi.stubEnv("NEXT_PUBLIC_SEARCH_V2", "on");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("경로 전환", () => {
  it("기본은 구 경로다 — v2는 명시적 opt-in", async () => {
    vi.unstubAllEnvs();
    rpcPostMock.mockResolvedValue([]);
    await fetchSearchPage("나이키", null, 30, "여성");
    expect(rpcPostMock.mock.calls[0][0]).toBe("c_search_page");
  });

  it("잘못된 값이면 켜지지 않는다 — fail-open이 아니다", async () => {
    for (const v of ["off", "true", "1", ""]) {
      vi.stubEnv("NEXT_PUBLIC_SEARCH_V2", v);
      rpcPostMock.mockReset();
      rpcPostMock.mockResolvedValue([]);
      await fetchSearchPage("나이키", null, 30, "여성");
      expect(rpcPostMock.mock.calls[0][0]).toBe("c_search_page");
    }
  });

  it("구 경로도 같은 SearchPage 계약을 돌려준다", async () => {
    vi.unstubAllEnvs();
    rpcPostMock.mockResolvedValue([{ ...dto, goods_no: 7 }]);
    const page = await fetchSearchPage("나이키", null, 30, "여성");
    expect(page.products).toHaveLength(1);
    expect(page.nextCursor).toEqual({ score: 0, goodsNo: 7 });
  });
});

describe("fetchSearchPage", () => {
  it("v2 RPC를 (점수, 번호) 커서로 호출한다 — 관련도 정렬의 keyset", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchSearchPage("나이키 반팔", { score: 1.5, goodsNo: 456 }, 30, "여성");
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_search_page_v2",
      {
        p_query: "나이키 반팔",
        p_after_score: 1.5,
        p_after: 456,
        p_size: 30,
        // 해석을 안 주면 null이다 — 서버가 `is null`로 조건 자체를 건너뛴다.
        // 빈 배열을 보내면 "아무것도 제외하지 않는 조건"이 생겨 계획이 달라진다.
        p_exclude: null,
        p_exclude_colors: null,
        // 성별은 모든 페이지에 실린다 — 질의문이 아니라 별도 인자라서다.
        p_gender: "여성",
      },
      { timeoutMs: 10_000 },
    );
  });

  it("첫 페이지는 커서 두 값을 모두 null로 보낸다 — 서버가 쌍이 아니면 거부한다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchSearchPage("나이키", null, 30, "여성");
    const params = rpcPostMock.mock.calls[0][1];
    expect(params.p_after_score).toBeNull();
    expect(params.p_after).toBeNull();
  });

  it("응답을 기존 피드와 같은 매핑으로 Product로 바꾼다 (CDN 접두 포함)", async () => {
    rpcPostMock.mockResolvedValue([{ ...dto, score: 2.5 }]);
    const page = await fetchSearchPage("나이키", null, 30, "여성");
    expect(page.products).toHaveLength(1);
    expect(page.products[0].goodsNo).toBe(123);
    expect(page.products[0].brandName).toBe("나이키");
    expect(page.products[0].gallery).toEqual([
      "https://image.msscdn.net/images/prd_img/b_500.jpg",
    ]);
  });

  it("마지막 행의 점수·번호를 다음 커서로 돌려준다", async () => {
    rpcPostMock.mockResolvedValue([
      { ...dto, goods_no: 1, score: 9 },
      { ...dto, goods_no: 2, score: 3 },
    ]);
    const page = await fetchSearchPage("나이키", null, 30, "여성");
    expect(page.nextCursor).toEqual({ score: 3, goodsNo: 2 });
  });

  it("결과가 없으면 다음 커서가 null이다", async () => {
    rpcPostMock.mockResolvedValue([]);
    const page = await fetchSearchPage("없는검색어", null, 30, "여성");
    expect(page.nextCursor).toBeNull();
  });
});
