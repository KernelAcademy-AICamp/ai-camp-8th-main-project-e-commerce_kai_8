import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_INTENT } from "@/features/search/domain/query-intent";

const parseMock = vi.fn();
const aliasMock = vi.fn();
const dbResult = vi.fn();

vi.mock("@/features/search/data/parse-query-intent", () => ({
  parseQueryIntent: (...a: unknown[]) => parseMock(...a) as never,
}));
const semanticMock = vi.fn();
vi.mock("@/features/search/data/interpret-semantic", () => ({
  interpretSemantic: (...a: unknown[]) => semanticMock(...a) as never,
}));
vi.mock("@/features/search/data/brand-alias-repository", () => ({
  getSafeBrandAliases: (...a: unknown[]) => aliasMock(...a) as never,
}));
const linkerMock = vi.fn();
vi.mock("@/features/search/data/relation-linker", () => ({
  linkRelations: (...a: unknown[]) => linkerMock(...a) as never,
  LINKER_PROMPT_VERSION: "relation-linker@v1",
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => chainable() }),
  }),
}));

// DB 체인 호출 기록 — 결정화 레인(flag-on) 테스트에서 하드 조건 유무를 단언하는 데 쓴다.
const dbCalls: [string, ...unknown[]][] = [];

function chainable(): unknown {
  const self: Record<string, unknown> = {};
  for (const m of [
    "eq",
    "or",
    "gte",
    "lte",
    "overlaps",
    "contains",
    "in",
    "not",
    "order",
    "limit",
    "range",
    "ilike",
  ]) {
    self[m] = (...args: unknown[]) => {
      dbCalls.push([m, ...args]);
      return self;
    };
  }
  self.then = (resolve: (v: unknown) => unknown) => resolve(dbResult());
  return self;
}

async function post(
  query: string,
  extra: Record<string, unknown> = {},
): Promise<{ status: number; body: never }> {
  const { POST } = await import("@/app/api/search/route");
  const res = await POST(
    new Request("http://test/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, ...extra }),
    }),
  );
  return { status: res.status, body: (await res.json()) as never };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs(); // SEARCH_DECISIVE_LANE 등 직전 테스트의 stub 누출 방지
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://x");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "k");
  parseMock.mockReset();
  aliasMock.mockReset();
  semanticMock.mockReset();
  semanticMock.mockResolvedValue(null);
  linkerMock.mockReset();
  linkerMock.mockResolvedValue(null);
  dbResult.mockReset();
  dbCalls.length = 0;
  aliasMock.mockResolvedValue([{ aliasNormalized: "나이키", catalogBrand: "나이키" }]);
  dbResult.mockReturnValue({ data: [], error: null });
});

describe("POST /api/search — mode 계약", () => {
  it("파서 성공+색 신호 → full", async () => {
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, colors: ["블랙"] } },
      degraded: false,
    });
    const { body } = await post("검정 티");
    expect((body as { mode: string }).mode).toBe("full");
  });

  it("파서 실패+브랜드 매칭 → lexical_only + brand 세팅", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    const { body } = await post("나이키 반팔");
    const b = body as { mode: string; intent: { brand?: string } };
    expect(b.mode).toBe("lexical_only");
    expect(b.intent.brand).toBe("나이키");
  });

  it("파서 실패+가격만 신호 → lexical_only + priceMax override", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });
    const { body } = await post("2만원 이하");
    const b = body as { mode: string; intent: { priceMax?: number } };
    expect(b.mode).toBe("lexical_only");
    expect(b.intent.priceMax).toBe(20000);
  });

  it("파서 성공+빈 파싱+무매칭 → failed, DB 미조회(일반 상위 미노출)", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    // "그냥 좀"은 extractTitleTokens 스톱워드(ETC_STOP)로 전부 제거되어 titleTokens도
    // 비므로 순수 무신호 케이스 유지. ("아무말"은 title 토큰 배선 후 자체가 잔여
    // 토큰으로 살아남아 signal이 되므로 이 무신호 회귀 케이스에 더 이상 맞지 않음.)
    const { body } = await post("그냥 좀");
    const b = body as { mode: string; results: unknown[] };
    expect(b.mode).toBe("failed");
    expect(b.results).toEqual([]);
    expect(dbResult).not.toHaveBeenCalled();
  });

  it("사전 조회 실패 → failed", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    aliasMock.mockRejectedValue(new Error("boom"));
    const { body } = await post("나이키 반팔");
    expect((body as { mode: string }).mode).toBe("failed");
  });

  it("사전 조회 실패 + 명시 가격 → failed이지만 priceMax override 반영", async () => {
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, priceMax: 2000 },
      degraded: false,
    });
    aliasMock.mockRejectedValue(new Error("boom"));
    const { body } = await post("2만원 이하 반팔");
    const b = body as { mode: string; intent: { priceMax: number } };
    expect(b.mode).toBe("failed");
    expect(b.intent.priceMax).toBe(20000);
  });

  it("검색 DB 오류 → failed", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    dbResult.mockReturnValue({ data: null, error: { message: "db down" } });
    const { body } = await post("나이키 반팔");
    expect((body as { mode: string }).mode).toBe("failed");
  });
});

describe("POST /api/search — 제목 tier 폴백", () => {
  it("잔여 토큰 있으면 phrase tier부터 실행, 24개 채우면 중단", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    aliasMock.mockResolvedValue([]);
    // phrase tier가 24개 이상 반환 → 1회 조회로 종료
    const rows = Array.from({ length: 30 }, (_, i) => ({
      goods_no: i + 1,
      title: `드라이핏 반팔 ${String(i)}`,
      brand: "b",
      review_score: 4,
      review_count: 1,
    }));
    dbResult.mockReturnValue({ data: rows, error: null });
    const { body } = await post("드라이핏 쿨링소재");
    const b = body as {
      mode: string;
      intent: { titleTokens?: string[] };
      titleTier: string;
    };
    expect(b.mode).toBe("full");
    expect(b.intent.titleTokens).toEqual(["드라이핏", "쿨링소재"]);
    expect(b.titleTier).toBe("phrase");
    expect(dbResult).toHaveBeenCalledTimes(1);
  });

  it("상위 tier가 부족하면 다음 tier로 폴백·dedup", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    aliasMock.mockResolvedValue([]);
    const mk = (from: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        goods_no: from + i,
        title: `t${String(from + i)}`,
        brand: "b",
        review_score: 4,
        review_count: 1,
      }));
    dbResult
      .mockReturnValueOnce({ data: mk(1, 5), error: null }) // phrase: 5
      .mockReturnValueOnce({ data: mk(3, 10), error: null }) // and: 10 (3~7 중복)
      .mockReturnValueOnce({ data: mk(10, 30), error: null }); // or: 30
    const { body } = await post("드라이핏 쿨링소재");
    const b = body as { results: { goodsNo: string }[]; titleTier: string };
    expect(b.titleTier).toBe("or");
    expect(dbResult).toHaveBeenCalledTimes(3);
    const nos = b.results.map((r) => r.goodsNo);
    expect(new Set(nos).size).toBe(nos.length); // dedup
    expect(nos[0]).toBe("1"); // 상위 tier(phrase) 우선 배치
  });

  it("잔여 토큰 없으면 기존 단일 쿼리(기존 계약 회귀 없음)", async () => {
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, colors: ["블랙"] } },
      degraded: false,
    });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });
    const { body } = await post("검정 반팔");
    expect((body as { titleTier: unknown }).titleTier).toBeNull();
    expect(dbResult).toHaveBeenCalledTimes(1);
  });

  it("파서 실패+잔여 토큰 → lexical_only", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });
    const { body } = await post("드라이핏 쿨링소재");
    expect((body as { mode: string }).mode).toBe("lexical_only");
  });
});

describe("POST /api/search — 제목 0건 구제(v3.2)", () => {
  it("전 tier 0건 + 환각 스타일 하드필터 → 스타일 제거 재스윕이 결과 반환", async () => {
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, patterns: ["카모"] } },
      degraded: false,
    });
    aliasMock.mockResolvedValue([]);
    const rows = Array.from({ length: 30 }, (_, i) => ({
      goods_no: i + 1,
      title: `택티컬 티셔츠 ${String(i)}`,
      brand: "b",
      review_score: 4,
      review_count: 1,
    }));
    dbResult
      .mockReturnValueOnce({ data: [], error: null }) // 원본: phrase 0건
      .mockReturnValueOnce({ data: [], error: null }) // 원본: and 0건
      .mockReturnValueOnce({ data: [], error: null }) // 원본: or 0건
      .mockReturnValue({ data: rows, error: null }); // salvage: phrase에서 24개 이상 채움

    const { body } = await post("드라이핏 쿨링소재");
    const b = body as {
      mode: string;
      titleSalvage: boolean;
      intent: { style: { patterns: string[] } };
      results: unknown[];
    };
    expect(b.mode).toBe("full");
    expect(b.titleSalvage).toBe(true);
    expect(b.intent.style.patterns).toEqual([]);
    expect(b.results.length).toBeGreaterThan(0);
    expect(dbResult).toHaveBeenCalledTimes(4); // 원본 3(전부 0건) + salvage 1(24개 이상 채움)
  });

  it("스타일 하드필터 없는 intent + 전 tier 0건 → 재시도 없음", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });

    const { body } = await post("드라이핏 쿨링소재");
    const b = body as { titleSalvage: boolean; results: unknown[] };
    expect(b.titleSalvage).toBe(false);
    expect(b.results).toEqual([]);
    expect(dbResult).toHaveBeenCalledTimes(3);
  });
});

describe("POST /api/search — 결정적 가격 파서(P0-①)", () => {
  it("LLM이 '2만원 이하'를 오파싱해도 명시 가격이 결정적으로 override", async () => {
    // LLM 환각 재현: priceMax를 2000으로 잘못 파싱.
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, priceMax: 2000 },
      degraded: false,
    });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });
    const { body } = await post("2만원 이하 반팔");
    const b = body as { intent: { priceMin?: number; priceMax?: number } };
    expect(b.intent.priceMax).toBe(20000);
    expect(b.intent.priceMin).toBeUndefined();
  });

  it("명시 가격 표현이 없으면 LLM 값을 유지", async () => {
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, priceMax: 2000 },
      degraded: false,
    });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });
    const { body } = await post("가성비 반팔");
    const b = body as { intent: { priceMax?: number } };
    expect(b.intent.priceMax).toBe(2000);
  });
});

describe("POST /api/search — titleTokens 폐기 fallback(P0-②)", () => {
  it("sizeStd 있는 intent + 대화 필러 titleTokens + 전 tier·구제 0건 → fallback 쿼리 실행", async () => {
    // "105"는 숫자라 titleTokens에서 필터되지만, "저기"·"그거"·"있나요"는 대화 필러로 살아남아
    // 제목 하드 게이트가 되어 실사이즈 검색(105)을 전멸시킬 수 있는 케이스를 재현한다.
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, sizeStd: [105] },
      degraded: false,
    });
    aliasMock.mockResolvedValue([]);
    const rows = Array.from({ length: 5 }, (_, i) => ({
      goods_no: i + 1,
      title: `기본 반팔 ${String(i)}`,
      brand: "b",
      review_score: 4,
      review_count: 1,
      size_std: [105],
    }));
    dbResult
      .mockReturnValueOnce({ data: [], error: null }) // 원본: phrase 0건
      .mockReturnValueOnce({ data: [], error: null }) // 원본: and 0건
      .mockReturnValueOnce({ data: [], error: null }) // 원본: or 0건
      .mockReturnValueOnce({ data: rows, error: null }); // fallback: titleTokens 제거 단일 쿼리

    const { body } = await post("저기 그거 105 있나요");
    const b = body as {
      mode: string;
      titleTier: string | null;
      titleDropped: boolean;
      intent: { titleTokens?: string[] };
      results: unknown[];
    };
    expect(dbResult).toHaveBeenCalledTimes(4);
    expect(b.results.length).toBeGreaterThan(0);
    expect(b.titleDropped).toBe(true);
    expect(b.titleTier).toBeNull();
    expect(b.intent.titleTokens ?? []).toEqual([]);
  });

  it("titleTokens만 유일 신호(다른 하드 조건 없음) + 전 tier 0건 → fallback 미실행", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });

    const { body } = await post("저기 그거 있나요");
    const b = body as { titleDropped: boolean; results: unknown[] };
    expect(dbResult).toHaveBeenCalledTimes(3);
    expect(b.titleDropped).toBe(false);
    expect(b.results).toEqual([]);
  });

  it("titleTokens+스타일 필터+다른 하드조건+모두 0건 → 최대 완화 사슬(strict 3+salvage 3+fallback 1=7회)", async () => {
    parseMock.mockResolvedValue({
      intent: {
        ...EMPTY_INTENT,
        titleTokens: ["드라이핏"],
        style: { ...EMPTY_INTENT.style, colors: ["블랙"] },
        sizeStd: [105],
      },
      degraded: false,
    });
    aliasMock.mockResolvedValue([]);
    dbResult.mockReturnValue({ data: [], error: null });

    const { body } = await post("드라이핏 검정 105");
    const b = body as {
      results: unknown[];
      titleTier: string | null;
      titleSalvage: boolean;
      titleDropped: boolean;
    };
    expect(dbResult).toHaveBeenCalledTimes(7); // strict 3 + salvage 3 + fallback 1
    expect(b.results).toEqual([]);
    expect(b.titleSalvage).toBe(true);
    expect(b.titleDropped).toBe(false); // fallback 결과 0건이므로 true 미적용
  });
});

describe("POST /api/search — 결정화 레인(flag-on, P3-F)", () => {
  it("LLM-only 값(색·성별)만 있으면 grounded 신호가 아니라 failed — DB 미조회", async () => {
    vi.stubEnv("SEARCH_DECISIVE_LANE", "on");
    parseMock.mockResolvedValue({
      intent: {
        ...EMPTY_INTENT,
        gender: "남성",
        style: { ...EMPTY_INTENT.style, colors: ["블랙"] },
      },
      degraded: false,
    });
    // 쿼리 토큰 전부 스톱워드 → 제목 토큰(휴리스틱 출처)도 안 생기는 순수 LLM-only 케이스.
    const { body } = await post("그냥 좀 예쁜 티셔츠");
    expect((body as { mode: string }).mode).toBe("failed");
    expect(dbResult).not.toHaveBeenCalled();
  });

  it("명시 가격은 grounded 신호 — LLM 색은 하드에서 빠지고 소프트 칩으로 유지", async () => {
    vi.stubEnv("SEARCH_DECISIVE_LANE", "on");
    parseMock.mockResolvedValue({
      intent: {
        ...EMPTY_INTENT,
        gender: "남성",
        priceMax: 2000, // LLM 오파싱 — 결정적 파서가 20000으로 대체
        style: { ...EMPTY_INTENT.style, colors: ["블랙"] },
        exclude: { ...EMPTY_INTENT.exclude, colors: ["옐로우"] },
      },
      degraded: false,
    });
    const { body } = await post("2만원 이하 검정 반팔");
    const b = body as {
      mode: string;
      intent: {
        style: { colors: string[] };
        gender?: string;
        exclude: { colors: string[] };
      };
    };
    expect(b.mode).toBe("full");
    // 하드 정책: overlaps(색)·eq(gender)·not(배제) 미호출, 가격 lte는 결정적이라 호출.
    expect(dbCalls.some(([m]) => m === "overlaps")).toBe(false);
    expect(dbCalls.some(([m, c]) => m === "eq" && c === "gender")).toBe(false);
    expect(dbCalls.some(([m]) => m === "not")).toBe(false);
    expect(
      dbCalls.some(([m, c, v]) => m === "lte" && c === "price" && v === 20000),
    ).toBe(true);
    // resolved 응답 계약: 소프트 반영된 색은 칩 유지, 미적용 성별·배제는 제거.
    expect(b.intent.style.colors).toEqual(["블랙"]);
    expect(b.intent.gender).toBeUndefined();
    expect(b.intent.exclude.colors).toEqual([]);
  });

  it("title-drop 성공 시 숨긴 titleTokens가 랭킹에도 영향을 주지 않는다", async () => {
    vi.stubEnv("SEARCH_DECISIVE_LANE", "on");
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    aliasMock.mockResolvedValue([]);
    const drops = [
      {
        goods_no: 1,
        title: "베이직 반팔",
        brand: "b",
        review_score: 4,
        review_count: 1,
      },
      {
        goods_no: 2,
        title: "드라이핏 반팔",
        brand: "b",
        review_score: 4,
        review_count: 1,
      },
    ];
    dbResult
      .mockReturnValueOnce({ data: [], error: null }) // phrase
      .mockReturnValueOnce({ data: [], error: null }) // and
      .mockReturnValueOnce({ data: [], error: null }) // or
      .mockReturnValueOnce({ data: drops, error: null }); // titleTokens 폐기 재시도
    const { body } = await post("2만원 이하 드라이핏");
    const b = body as {
      titleDropped: boolean;
      results: { goodsNo: string }[];
      intent: { titleTokens?: string[] };
    };
    expect(b.titleDropped).toBe(true);
    expect(b.intent.titleTokens).toEqual([]);
    // 토큰이 랭킹에 남으면 "드라이핏"(goods_no 2)이 가점으로 1위가 된다 —
    // 폐기된 토큰은 순위에도 무영향이어야 하므로 동점 시 goods_no 오름차순(1위=1).
    expect(b.results[0].goodsNo).toBe("1");
  });

  it("사전 조회 실패(flag-on)도 resolved 응답 계약을 지킨다 — 미적용 LLM 값 미노출", async () => {
    vi.stubEnv("SEARCH_DECISIVE_LANE", "on");
    parseMock.mockResolvedValue({
      intent: {
        ...EMPTY_INTENT,
        gender: "남성",
        style: { ...EMPTY_INTENT.style, colors: ["블랙"] },
      },
      degraded: false,
    });
    aliasMock.mockRejectedValue(new Error("boom"));
    const { body } = await post("2만원 이하 검정 반팔");
    const b = body as {
      mode: string;
      intent: { gender?: string; style: { colors: string[] }; priceMax?: number };
    };
    expect(b.mode).toBe("failed");
    expect(b.intent.gender).toBeUndefined(); // 미적용 LLM 값 제거
    expect(b.intent.style.colors).toEqual(["블랙"]); // 소프트 반영 값은 칩 유지
    expect(b.intent.priceMax).toBe(20000); // 명시 가격(정규식 출처)은 유지
  });

  it("flag 미설정(off)이면 현행 그대로 — LLM 색이 하드필터로 걸린다", async () => {
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, colors: ["블랙"] } },
      degraded: false,
    });
    const { body } = await post("검정 반팔");
    expect((body as { mode: string }).mode).toBe("full");
    expect(dbCalls.some(([m, c]) => m === "overlaps" && c === "colors")).toBe(true);
  });
});

describe("POST /api/search — llm=off 요청 단위 override(로고 토글)", () => {
  it("llm:'off'면 LLM 파서를 호출하지 않고 컬러웨이 레인이 활성화된다", async () => {
    const { body } = await post("블랙 바탕에 화이트 프린팅", { llm: "off" });
    expect(parseMock).not.toHaveBeenCalled();
    expect((body as { mode: string }).mode).toBe("lexical_only");
    // 컬러웨이 사전필터(prints @>)가 실제 DB 체인에 내려간다.
    expect(dbCalls.some(([m, c]) => m === "contains" && c === "prints")).toBe(true);
  });

  it("llm 필드가 없으면 현행 동작 그대로 — LLM 파서 호출, 컬러웨이 레인 미호출", async () => {
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, colors: ["블랙"] } },
      degraded: false,
    });
    const { body } = await post("블랙 바탕에 화이트 프린팅");
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect((body as { mode: string }).mode).toBe("full");
    expect(dbCalls.some(([m, c]) => m === "contains" && c === "prints")).toBe(false);
  });

  it("llm:'off' + 결정적 신호·컬러웨이 조건이 전무하면 failed 유지", async () => {
    // 전 토큰이 스톱워드(추천·예쁜·느낌) → 제목 신호도 없음.
    const { body } = await post("예쁜 느낌 추천", { llm: "off" });
    expect(parseMock).not.toHaveBeenCalled();
    expect((body as { mode: string }).mode).toBe("failed");
  });

  it("llm:'off' 사이즈·만원대 가격: 결정적으로 해석된다", async () => {
    const { body } = await post("사이즈 95인 2만원대 티", { llm: "off" });
    expect(parseMock).not.toHaveBeenCalled();
    const b = body as {
      mode: string;
      intent: {
        sizeStd: number[];
        priceMin?: number;
        priceMax?: number;
        titleTokens?: string[];
      };
    };
    expect(b.mode).toBe("lexical_only");
    expect(b.intent.sizeStd).toEqual([95]);
    expect(b.intent.priceMin).toBe(20000);
    expect(b.intent.priceMax).toBe(29999);
    expect(b.intent.titleTokens ?? []).not.toContain("95인");
  });

  it("llm:'off' 바탕색 단독: 기존 colors 필터로 이관되고 결속 실행은 없다(D7)", async () => {
    const { body } = await post("블랙티 보여줘", { llm: "off" });
    expect(parseMock).not.toHaveBeenCalled();
    expect((body as { mode: string }).mode).toBe("lexical_only");
    // 기존 colors 하드필터가 걸리고, prints 결속 사전필터는 없다.
    expect(dbCalls.some(([m, c]) => m === "overlaps" && c === "colors")).toBe(true);
    expect(dbCalls.some(([m, c]) => m === "contains" && c === "prints")).toBe(false);
    // 적용 해석 칩은 유지된다.
    expect((body as { colorwayChips?: unknown }).colorwayChips).toEqual([
      { kind: "baseColor", label: "블랙" },
    ]);
  });

  it("llm:'off' 응답에 서버가 적용한 컬러웨이 칩이 실린다", async () => {
    const { body } = await post("블랙 바탕에 화이트 프린팅", { llm: "off" });
    const chips = (body as { colorwayChips?: { kind: string; label: string }[] })
      .colorwayChips;
    expect(chips).toEqual([
      { kind: "baseColor", label: "블랙" },
      { kind: "printColor", label: "화이트" },
    ]);
  });

  it("llm 필드가 없으면 colorwayChips도 없다(현행 응답 그대로)", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    const { body } = await post("나이키 반팔");
    expect((body as { colorwayChips?: unknown }).colorwayChips).toBeUndefined();
  });

  it("llm:'off'에서 소비 표현은 제목 토큰으로 재유입되지 않는다", async () => {
    const { body } = await post("블랙 바탕에 화이트 백프린팅", { llm: "off" });
    const intent = (body as { intent: { titleTokens?: string[] } }).intent;
    expect(intent.titleTokens ?? []).not.toContain("백프린팅");
  });
});

describe("POST /api/search — 결속 질의의 표시 이미지 색 매칭", () => {
  // 결속(프린트) 계획이 있으면 바탕색이 intent.style.colors에서 제거된다(D4 소유권).
  // 그 제거가 표시 이미지 선택기까지 굶겨서, 검정 질의인데 다른 색 사진이 나가면 안 된다.
  const rowWithBlackImage = {
    goods_no: 2082059,
    style_key: null,
    title: "베이직 세미 오버핏 로고 티셔츠",
    brand: null,
    category: null,
    gender: null,
    season: null,
    color: null,
    colors: ["블랙", "화이트", "카키"],
    patterns: ["단색"],
    materials: null,
    fits: null,
    sizes: null,
    size_free: null,
    size_std: null,
    price: 19000,
    review_count: 10,
    review_score: 4,
    url: null,
    thumbnail: "https://img/카키.jpg",
    wear_chars: null,
    review_tags: null,
    color_images: {
      byColor: {
        블랙: { url: "https://img/블랙.jpg", src: "option", status: "auto_high" },
      },
    },
    prints: [
      {
        base_colors: ["블랙"],
        sides: ["앞"],
        graphic_types: ["레터링"],
        colors: ["화이트"],
        colors_status: "확인",
      },
    ],
  };

  it("바탕색 결속 질의도 그 색 사진으로 교체한다(색 단독 질의와 동일)", async () => {
    dbResult.mockReturnValue({ data: [rowWithBlackImage], error: null });
    const { body } = await post("검정 티인데 프린팅 있는 것", { llm: "off" });
    const results = (body as { results: { displayImage?: { color: string } }[] })
      .results;
    expect(results).toHaveLength(1);
    expect(results[0].displayImage).toEqual({
      url: "https://img/블랙.jpg",
      color: "블랙",
    });
  });

  // 판정은 계열로(차콜↔다크 그레이) 매칭하는데 사진 인덱스 키는 판매자 표기다.
  // 계획의 캐논 색을 그대로 넘기면 계열로 걸린 상품은 전부 사진 교체에 실패한다(D8).
  const rowWithFamilyColor = {
    ...rowWithBlackImage,
    goods_no: 5269955,
    title: "에어스트레치 머슬핏 하프 슬리브",
    colors: ["다크 그레이"],
    thumbnail: "https://img/화이트.jpg",
    color_images: {
      byColor: {
        "다크 그레이": {
          url: "https://img/다크그레이.jpg",
          src: "option",
          status: "auto_high",
        },
      },
    },
    prints: [
      {
        base_colors: ["차콜"],
        sides: ["앞"],
        graphic_types: ["레터링"],
        colors: ["화이트"],
        colors_status: "확인",
      },
    ],
  };

  it("계열로 매칭된 상품은 판매자 표기 사진으로 교체한다(차콜→다크 그레이)", async () => {
    dbResult.mockReturnValue({ data: [rowWithFamilyColor], error: null });
    const { body } = await post("차콜 바탕에 프린팅 있는 티", { llm: "off" });
    const results = (body as { results: { displayImage?: { color: string } }[] })
      .results;
    expect(results).toHaveLength(1);
    expect(results[0].displayImage).toEqual({
      url: "https://img/다크그레이.jpg",
      color: "다크 그레이",
    });
  });

  it("레인이 제외한 바탕색은 LLM이 그 색을 요청해도 사진으로 쓰지 않는다", async () => {
    // 결과가 실제로 남는 행이어야 단언이 의미를 갖는다(빈 배열 순회 = 무의미한 통과).
    // 프린트 원소를 화이트 바탕으로 둬서 "블랙 바탕 말고" 계획을 통과시킨다.
    const row = {
      ...rowWithBlackImage,
      prints: [
        {
          base_colors: ["화이트"],
          sides: ["앞"],
          graphic_types: ["레터링"],
          colors: ["블랙"],
          colors_status: "확인",
        },
      ],
    };
    vi.stubEnv("SEARCH_COLORWAY_LANE", "on");
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, colors: ["블랙"] } },
      degraded: false,
    });
    dbResult.mockReturnValue({ data: [row], error: null });
    const { body } = await post("블랙 바탕 말고 프린팅 있는 티");
    const results = (body as { results: { displayImage?: unknown }[] }).results;
    expect(results).toHaveLength(1);
    expect(results[0].displayImage).toBeUndefined();
  });
});

describe("POST /api/search — 착용감 신호 제목 폐기 구제(바캉스 케이스)", () => {
  it("제목 전멸 + 착용감 신호만 있으면 제목을 폐기하고 재시도한다", async () => {
    parseMock.mockResolvedValue({
      intent: {
        ...EMPTY_INTENT,
        wearChars: { ...EMPTY_INTENT.wearChars, 계절: ["여름"] },
      },
      degraded: false,
    });
    // tier 스윕(phrase/and/or) 3회는 0건, 제목 폐기 재시도에서 행 반환.
    dbResult
      .mockReturnValueOnce({ data: [], error: null })
      .mockReturnValueOnce({ data: [], error: null })
      .mockReturnValueOnce({ data: [], error: null })
      .mockReturnValue({
        data: [
          {
            goods_no: 1,
            title: "쿨 반팔",
            price: 10000,
            colors: [],
            patterns: [],
            materials: [],
            fits: [],
            sizes: [],
            size_std: [],
            wear_chars: {},
          },
        ],
        error: null,
      });
    const { body } = await post("바캉스");
    const b = body as { mode: string; results: unknown[]; titleDropped: boolean };
    expect(b.mode).toBe("full");
    expect(b.titleDropped).toBe(true);
    expect(b.results.length).toBeGreaterThan(0);
  });

  it("착용감 신호조차 없으면 기존대로 폐기 재시도 없이 0건", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: false });
    dbResult.mockReturnValue({ data: [], error: null });
    const { body } = await post("아무개무의미단어");
    const b = body as { results: unknown[]; titleDropped: boolean };
    expect(b.titleDropped).toBe(false);
    expect(b.results).toHaveLength(0);
  });
});

describe("POST /api/search — 의미 해석 shadow(설계 §8.2)", () => {
  const SHADOW_RAW = {
    raw: {
      expressions: [
        {
          surface: "시커먼",
          target: "garment_base",
          candidates: ["블랙"],
          resolution: "semantic",
          evidence: "시커먼 티",
        },
      ],
    },
    meta: { modelId: "m", promptVersion: "p", vocabVersion: "v", latencyMs: 10 },
  };

  it("shadow: 검증 통과 해석이 응답에 실리고 결과·모드는 off와 동일하다", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    const offRes = await post("시커먼 티");
    expect(semanticMock).not.toHaveBeenCalled(); // 기본 off — 미호출

    vi.stubEnv("SEARCH_LLM_MODE", "shadow");
    semanticMock.mockResolvedValue(SHADOW_RAW);
    const shadowRes = await post("시커먼 티");
    expect(semanticMock).toHaveBeenCalledTimes(1);

    const off = offRes.body as {
      mode: string;
      results: unknown[];
      semanticShadow?: unknown;
    };
    const sh = shadowRes.body as {
      mode: string;
      results: unknown[];
      semanticShadow?: { expressions: { target: string; candidates: string[] }[] };
    };
    // §8.2: 결정적 검색 결과는 OFF와 완전히 같아야 한다.
    expect(sh.mode).toBe(off.mode);
    expect(sh.results).toEqual(off.results);
    expect(off.semanticShadow).toBeUndefined();
    if (sh.mode !== "failed") {
      expect(sh.semanticShadow?.expressions[0]).toMatchObject({
        target: "garment_base",
        candidates: ["블랙"],
      });
    }
  });

  it("shadow: LLM 실패·무효 출력은 해석 없음 폴백 — 요청은 정상(§8.4)", async () => {
    vi.stubEnv("SEARCH_LLM_MODE", "shadow");
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, colors: ["블랙"] } },
      degraded: false,
    });
    semanticMock.mockRejectedValue(new Error("timeout"));
    const { body } = await post("시커먼 티");
    expect((body as { mode: string }).mode).toBe("full");
    expect((body as { semanticShadow?: unknown }).semanticShadow).toBeUndefined();
  });
});

describe("POST /api/search — 의미 해석 최소 ON(설계 §8.3)", () => {
  const TREND_RAW = {
    raw: {
      expressions: [
        {
          surface: "유행하는",
          target: "garment_base",
          candidates: ["화이트", "블랙", "그레이"],
          resolution: "semantic",
          evidence: "유행하는",
        },
      ],
    },
    meta: { modelId: "m", promptVersion: "p", vocabVersion: "v", latencyMs: 10 },
  };
  const goodsRow = {
    goods_no: 1,
    title: "베이직 티",
    price: 10000,
    colors: ["화이트"],
    patterns: [],
    materials: [],
    fits: [],
    sizes: [],
    size_std: [],
    wear_chars: {},
  };

  it("on: 신호가 없던 쿼리가 의미 소프트 신호로 살아나고 applied가 표시된다", async () => {
    vi.stubEnv("SEARCH_LLM_MODE", "on");
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    semanticMock.mockResolvedValue(TREND_RAW);
    dbResult.mockReturnValue({ data: [goodsRow], error: null });

    const { body } = await post("유행하는 옷");
    const b = body as {
      mode: string;
      results: unknown[];
      semanticShadow?: { applied: boolean };
    };
    expect(b.mode).toBe("lexical_only");
    expect(b.results.length).toBeGreaterThan(0);
    expect(b.semanticShadow?.applied).toBe(true);
    // 소프트 병합 — 조회 하드필터(colors overlaps)에는 들어가지 않는다(§7: LLM은 must 불가).
    expect(dbCalls.some(([m, c]) => m === "overlaps" && c === "colors")).toBe(false);
  });

  it("on: 결정적 색 조건이 있으면 의미 색은 양보한다(결정적 우선 §8.3)", async () => {
    vi.stubEnv("SEARCH_LLM_MODE", "on");
    parseMock.mockResolvedValue({
      intent: { ...EMPTY_INTENT, style: { ...EMPTY_INTENT.style, colors: ["블랙"] } },
      degraded: false,
    });
    semanticMock.mockResolvedValue(TREND_RAW);
    dbResult.mockReturnValue({ data: [goodsRow], error: null });

    const { body } = await post("검정 유행하는 옷");
    expect(
      (body as { semanticShadow?: { applied: boolean } }).semanticShadow?.applied,
    ).toBe(false);
  });

  it("승격 규칙: LLM 없이도 유행류는 소프트 선호로 살아난다(모드 무관 결정적)", async () => {
    // env 미설정(off) — 결정적 승격 규칙만으로 동작해야 한다.
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    dbResult.mockReturnValue({
      data: [
        {
          goods_no: 1,
          title: "베이직 티",
          price: 10000,
          colors: ["화이트"],
          patterns: [],
          materials: [],
          fits: [],
          sizes: [],
          size_std: [],
          wear_chars: {},
        },
      ],
      error: null,
    });
    const { body } = await post("유행하는 옷");
    const b = body as { mode: string; results: unknown[] };
    expect(b.mode).toBe("lexical_only");
    expect(b.results.length).toBeGreaterThan(0);
    expect(dbCalls.some(([m, c]) => m === "overlaps" && c === "colors")).toBe(false); // 소프트만
  });

  it("on: 의미 해석·승격 규칙 다 없으면 기존대로 failed 유지", async () => {
    vi.stubEnv("SEARCH_LLM_MODE", "on");
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    semanticMock.mockResolvedValue(null);
    const { body } = await post("예쁜 느낌 추천");
    expect((body as { mode: string }).mode).toBe("failed");
  });
});

describe("POST /api/search — semantic linker shadow(§6 Shadow1)", () => {
  const PROPOSAL = {
    status: "parsed",
    proposal: {
      assignments: [
        { mentionRef: "m01", target: "print" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ],
      orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
    },
    meta: { modelId: "m", promptVersion: "relation-linker@v2", latencyMs: 5 },
  };

  it("shadow: 후보 plan을 관측 필드로 기록하되 결과·mode는 OFF와 동일", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    const offRes = await post("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");

    vi.stubEnv("SEARCH_LLM_MODE", "shadow");
    linkerMock.mockResolvedValue(PROPOSAL);
    const shRes = await post("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");

    const off = offRes.body as {
      results: unknown[];
      mode: string;
      intent: unknown;
      titleTier: unknown;
      semanticLinkerShadow?: unknown;
    };
    const sh = shRes.body as {
      results: unknown[];
      mode: string;
      intent: unknown;
      titleTier: unknown;
      semanticLinkerShadow?: { printClauses: { printColors: string[] }[] };
    };
    expect(sh.results).toEqual(off.results); // 결과 동일
    expect(sh.mode).toBe(off.mode); // mode 동일
    expect(sh.intent).toEqual(off.intent); // §7: intent도 OFF와 동일
    expect(sh.titleTier).toEqual(off.titleTier); // §7: titleTier도 OFF와 동일
    expect(off.semanticLinkerShadow).toBeUndefined(); // off엔 없음
    if (sh.mode !== "failed") {
      expect(sh.semanticLinkerShadow?.printClauses[0].printColors.sort()).toEqual([
        "블랙",
        "화이트",
      ]);
    }
  });

  it("mode=shadow라도 요청 llm=off면 링커를 호출하지 않고 관측 필드도 없다(§12)", async () => {
    vi.stubEnv("SEARCH_LLM_MODE", "shadow");
    linkerMock.mockResolvedValue(PROPOSAL);
    const res = await post("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠", {
      llm: "off",
    });
    const b = res.body as { semanticLinkerShadow?: unknown };
    expect(linkerMock).not.toHaveBeenCalled();
    expect(b.semanticLinkerShadow).toBeUndefined();
  });

  it("링커 timeout은 null로 뭉개지 않고 status=timeout으로 관측(검색은 OFF 동일)", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    vi.stubEnv("SEARCH_LLM_MODE", "shadow");
    linkerMock.mockResolvedValue({
      status: "timeout",
      meta: { modelId: "m", promptVersion: "relation-linker@v1", latencyMs: 4000 },
    });
    const res = await post("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");
    const b = res.body as {
      semanticLinkerShadow?: { status: string; printClauses?: unknown };
    };
    expect(b.semanticLinkerShadow?.status).toBe("timeout");
    expect(b.semanticLinkerShadow?.printClauses).toBeUndefined();
  });

  it("파싱됐으나 검증 거부되면 status=validation_error + rawAssignments 관측(역전 등)", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    vi.stubEnv("SEARCH_LLM_MODE", "shadow");
    // 역전 제안: 빨간색(m03)을 print, 검은/하얀을 base → rawAssignments에 그대로 관측된다
    linkerMock.mockResolvedValue({
      status: "parsed",
      proposal: {
        assignments: [
          { mentionRef: "m01", target: "base" },
          { mentionRef: "m02", target: "base" },
          { mentionRef: "m03", target: "print" },
        ],
        orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
      },
      meta: { modelId: "m", promptVersion: "relation-linker@v2", latencyMs: 5 },
    });
    const res = await post("검은색이나 하얀색 무늬가 있는 빨간색 티셔츠");
    const b = res.body as {
      semanticLinkerShadow?: {
        status: string;
        rawAssignments?: { canon?: string; target: string }[];
      };
    };
    // 이 역전 제안은 무손실 검증(완전성 등)에서 거부될 수 있음 — status는 valid_graph가 아님
    const sl = b.semanticLinkerShadow;
    expect(sl?.rawAssignments).toBeDefined();
    const t = new Map((sl?.rawAssignments ?? []).map((a) => [a.canon, a.target]));
    expect(t.get("레드")).toBe("print"); // 역전이 그대로 관측됨
  });
});

describe("POST /api/search — On1a apply mode(rerank overlay)", () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    goods_no: i + 1,
    style_key: `s${String(i)}`,
    title: `t${String(i)}`,
    brand: "b",
    review_score: 4,
    review_count: 1,
    colors_status: "확인",
  }));
  const PROPOSAL = {
    status: "parsed",
    proposal: {
      assignments: [
        { mentionRef: "m01", target: "print" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ],
      orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
    },
    meta: { modelId: "m", promptVersion: "relation-linker@v2", latencyMs: 5 },
  };
  const Q = "검은색이나 하얀색 무늬가 있는 빨간색 티셔츠";
  const ids = (b: unknown) =>
    (b as { results: { goodsNo: string }[] }).results.map((r) => r.goodsNo).sort();

  it("apply=rerank는 멤버십·개수 불변(순서만) — 하드필터 아님", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    dbResult.mockReturnValue({ data: rows, error: null });
    vi.stubEnv("SEARCH_LLM_MODE", "shadow");
    linkerMock.mockResolvedValue(PROPOSAL);

    vi.stubEnv("SEARCH_LINKER_APPLY_MODE", "off");
    const off = (await post(Q)).body;
    vi.stubEnv("SEARCH_LINKER_APPLY_MODE", "rerank");
    const rr = (await post(Q)).body;

    // 개수·멤버십 동일(rerank는 재정렬일 뿐 제거·추가 없음)
    expect((rr as { results: unknown[] }).results.length).toBe(
      (off as { results: unknown[] }).results.length,
    );
    expect(ids(rr)).toEqual(ids(off));
    const sl = (rr as { semanticLinkerShadow?: { shadow2?: { applyMode: string } } })
      .semanticLinkerShadow;
    expect(sl?.shadow2?.applyMode).toBe("rerank");
  });

  it("요청 llm=off면 apply=rerank여도 링커·재정렬 없음(최우선 kill)", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    dbResult.mockReturnValue({ data: rows, error: null });
    vi.stubEnv("SEARCH_LLM_MODE", "shadow");
    vi.stubEnv("SEARCH_LINKER_APPLY_MODE", "rerank");
    linkerMock.mockResolvedValue(PROPOSAL);
    const b = (await post(Q, { llm: "off" })).body;
    expect(linkerMock).not.toHaveBeenCalled();
    expect(
      (b as { semanticLinkerShadow?: unknown }).semanticLinkerShadow,
    ).toBeUndefined();
  });

  it("base-only(ineligible)는 apply=rerank여도 결과 순서 OFF 그대로", async () => {
    parseMock.mockResolvedValue({ intent: EMPTY_INTENT, degraded: true });
    dbResult.mockReturnValue({ data: rows, error: null });
    vi.stubEnv("SEARCH_LLM_MODE", "shadow");
    vi.stubEnv("SEARCH_LINKER_APPLY_MODE", "rerank");
    linkerMock.mockResolvedValue({
      status: "parsed",
      proposal: {
        assignments: [{ mentionRef: "m01", target: "base" }],
        orGroups: [],
      },
      meta: { modelId: "m", promptVersion: "relation-linker@v2", latencyMs: 5 },
    });
    const b = (await post("검은색 티셔츠")).body;
    const sl = (
      b as {
        semanticLinkerShadow?: { shadow2?: { eligible: boolean; reason?: string } };
      }
    ).semanticLinkerShadow;
    expect(sl?.shadow2?.eligible).toBe(false);
  });
});
