import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMixPage, mapMixDto } from "@/features/feed/data/mix-api";
import { rpcPost } from "@/shared/supabase-rpc";

vi.mock("@/shared/supabase-rpc", () => ({ rpcPost: vi.fn() }));

const rpcPostMock = vi.mocked(rpcPost);

beforeEach(() => {
  rpcPostMock.mockReset();
});

const dto = {
  goods_no: 123,
  title: "테스트 티셔츠",
  brand_name: "브랜드",
  price_final: 19900,
  thumbnail: "https://image.msscdn.net/thumbnails/a.jpg",
  gender: "공용",
  gallery: ["/images/prd_img/b_500.jpg"],
  width: 500,
  height: 600,
  slot: 0,
  source_bucket: "diversity",
  is_fresh: null,
  next_hk: null,
  next_no: null,
  pool_exhausted: null,
};

describe("mapMixDto", () => {
  it("믹스 응답을 domain Product로 바꾸고 유형·신선도를 싣는다", () => {
    const p = mapMixDto({ ...dto, source_bucket: "session", is_fresh: true });
    expect(p.goodsNo).toBe(123);
    expect(p.sourceBucket).toBe("session");
    expect(p.isFresh).toBe(true);
  });

  it("슬롯이 0보다 크면 매칭 이미지를 싣는다", () => {
    const p = mapMixDto({ ...dto, slot: 1 });
    expect(p.matchedImage?.slot).toBe(1);
  });

  it("슬롯이 0이면 매칭 이미지가 없다", () => {
    const p = mapMixDto({ ...dto, slot: 0 });
    expect(p.matchedImage).toBeUndefined();
  });
});

describe("fetchMixPage — 성별 하드 필터 (설계: 성별 피드 하드 필터 3단계)", () => {
  const baseRequest = {
    sessionAnchors: [{ goodsNo: 1, weight: 2 }],
    longAnchors: [{ goodsNo: 2, weight: 3 }],
    exclude: [9],
    seed: 1000,
    size: 30,
    boost: false,
    after: null,
    rotation: 0,
  };

  it("성별을 주면 p_gender로 싣는다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...baseRequest, gender: "남성" });
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_mix_page",
      expect.objectContaining({ p_gender: "남성" }),
      { timeoutMs: 5_000 },
    );
  });

  it("여성도 대칭으로 싣는다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...baseRequest, gender: "여성" });
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_mix_page",
      expect.objectContaining({ p_gender: "여성" }),
      { timeoutMs: 5_000 },
    );
  });

  // null을 싣는 경우는 **타입에서 막힌다**(gender가 필수다). 서버도 널을 오류로
  // 거부한다 — 정화해서 필터를 끄면 반대 성별과 공용이 다시 노출되기 때문이다.

  it("나머지 페이로드는 기존과 동일하다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...baseRequest, gender: "여성" });
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_mix_page",
      {
        p_session: [{ g: 1, w: 2 }],
        p_long: [{ g: 2, w: 3 }],
        p_exclude: [9],
        p_seed: 1000,
        p_size: 30,
        p_boost: false,
        p_gender: "여성",
        p_after_hk: null,
        p_after_no: null,
        p_rotation: 0,
      },
      { timeoutMs: 5_000 },
    );
  });
});

describe("fetchMixPage — 후보풀 커서", () => {
  const baseRequest = {
    sessionAnchors: [],
    longAnchors: [{ goodsNo: 2, weight: 3 }],
    exclude: [],
    seed: 1000,
    size: 30,
    boost: false,
    gender: "남성" as const,
    rotation: 0,
  };

  // 실제 서버가 낸 값이다. 64비트 경계 근처라 number로 다루면 깎인다.
  const BIG_NEG = "-9174854730392098679";
  const BIG_POS = "9223187735554687845";

  it("첫 요청에는 커서를 안 싣는다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...baseRequest, after: null });
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_mix_page",
      expect.objectContaining({ p_after_hk: null, p_after_no: null }),
      expect.anything(),
    );
  });

  it("받은 커서를 **문자열 그대로** 다음 요청에 싣는다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...baseRequest, after: { hk: BIG_NEG, no: "6393200" } });
    const body = rpcPostMock.mock.calls[0]?.[1];
    expect(body.p_after_hk).toBe(BIG_NEG);
    // 숫자로 바꾸면 값이 달라진다는 사실 자체를 고정한다. (지금 데이터에서는 그
    // 차이가 상품을 바꾸지 않는다 — mix-api.ts 주석 참고. 계약을 정확히 둘 뿐이다.)
    expect(String(Number(body.p_after_hk))).not.toBe(BIG_NEG);
  });

  it.each([BIG_NEG, BIG_POS])("커서 %s 가 왕복해도 그대로다", async (hk) => {
    rpcPostMock.mockResolvedValue([
      { ...dto, next_hk: hk, next_no: "42", pool_exhausted: false },
    ]);
    const page = await fetchMixPage({ ...baseRequest, after: null });
    expect(page.cursor).toEqual({ hk, no: "42" });
    expect(page.exhausted).toBe(false);
  });

  it("응답이 비면 커서는 null이다 — 호출부가 들고 있던 값을 유지한다", async () => {
    rpcPostMock.mockResolvedValue([]);
    const page = await fetchMixPage({ ...baseRequest, after: null });
    expect(page.cursor).toBeNull();
    expect(page.products).toEqual([]);
  });

  it("소진 신호를 읽는다", async () => {
    rpcPostMock.mockResolvedValue([
      { ...dto, next_hk: BIG_POS, next_no: "1", pool_exhausted: true },
    ]);
    const page = await fetchMixPage({ ...baseRequest, after: null });
    expect(page.exhausted).toBe(true);
  });

  it("제외 목록은 **가장 최근** 600개를 보낸다", async () => {
    rpcPostMock.mockResolvedValue([]);
    const exclude = Array.from({ length: 700 }, (_, i) => i); // 0..699, 오래된 것부터
    await fetchMixPage({ ...baseRequest, exclude, after: null });
    const body = rpcPostMock.mock.calls[0]?.[1];
    const sent = body.p_exclude as number[];
    expect(sent).toHaveLength(600);
    expect(sent[0]).toBe(100); // 앞의 100개(가장 오래된 것)가 빠졌다
    expect(sent.at(-1)).toBe(699); // 가장 최근 것이 남았다
  });
});

describe("fetchMixPage — 앵커 회전", () => {
  const req = {
    sessionAnchors: [],
    longAnchors: [{ goodsNo: 2, weight: 3 }],
    exclude: [],
    seed: 1000,
    size: 30,
    boost: false,
    gender: "남성" as const,
    after: null,
  };

  it("회전 번호를 p_rotation으로 싣는다", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...req, rotation: 7 });
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_mix_page",
      expect.objectContaining({ p_rotation: 7 }),
      expect.anything(),
    );
  });

  it("첫 페이지는 0이다 — 개정 전과 같은 동작", async () => {
    rpcPostMock.mockResolvedValue([]);
    await fetchMixPage({ ...req, rotation: 0 });
    expect(rpcPostMock).toHaveBeenCalledWith(
      "c_mix_page",
      expect.objectContaining({ p_rotation: 0 }),
      expect.anything(),
    );
  });
});
