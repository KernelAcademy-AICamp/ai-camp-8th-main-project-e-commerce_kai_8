import { describe, expect, it } from "vitest";

import {
  buildGoodsQuery,
  type GoodsQuery,
  type TitleTier,
} from "@/features/search/data/build-goods-query";
import {
  candidateCalls,
  candidatePlanKey,
} from "@/features/search/data/candidate-calls";
import { decisiveQueryIntent } from "@/features/search/domain/decisive-lane";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { buildQueryPlan } from "@/features/search/domain/query-plan";
import { resolveIntent } from "@/features/search/domain/resolved-intent";

type Call = [string, ...unknown[]];

// GoodsQuery 기록용 더블 — 호출 순서까지 기록(build-goods-query.test.ts와 동일 패턴).
function recorder(): GoodsQuery & { calls: Call[] } {
  const calls: Call[] = [];
  const self = {
    calls,
    eq: (c: string, v: unknown) => (calls.push(["eq", c, v]), self),
    or: (f: string) => (calls.push(["or", f]), self),
    gte: (c: string, v: unknown) => (calls.push(["gte", c, v]), self),
    lte: (c: string, v: unknown) => (calls.push(["lte", c, v]), self),
    overlaps: (c: string, v: readonly unknown[]) => (
      calls.push(["overlaps", c, [...v]]),
      self
    ),
    not: (c: string, op: string, v: unknown) => (calls.push(["not", c, op, v]), self),
    ilike: (c: string, p: string) => (calls.push(["ilike", c, p]), self),
    order: (c: string, o: { ascending: boolean }) => (
      calls.push(["order", c, o.ascending]),
      self
    ),
    limit: (n: number) => (calls.push(["limit", n]), self),
  };
  return self;
}

// 전 조건 유형을 덮는 풍부한 fixture.
const RICH: QueryIntent = {
  ...EMPTY_INTENT,
  brand: "데비웨어",
  titleTokens: ["드라이핏", "쿨링"],
  priceMin: 10000,
  priceMax: 30000,
  gender: "남성",
  sizeStd: [100, 105],
  style: {
    colors: ["블랙", "화이트"],
    patterns: ["스트라이프"],
    materials: ["폴리에스테르"],
    fits: ["오버"],
    keywords: ["간지"],
  },
  exclude: {
    colors: ["옐로우"],
    patterns: [],
    materials: [],
    fits: [],
    keywords: ["나염"],
  },
  wearChars: { ...EMPTY_INTENT.wearChars, 두께: ["두꺼움"] },
  sort: "review_count",
};

const TIERS: (TitleTier | undefined)[] = [undefined, "phrase", "and", "or"];

describe("buildQueryPlan — flag-off 동일성(전체 실행 계획 수준)", () => {
  it("후보 계획의 호출열이 현행 빌더의 실제 호출열과 tier별로 완전히 일치한다", () => {
    const plan = buildQueryPlan(resolveIntent({ intent: RICH, explicitPrice: true }), {
      decisive: false,
    });
    for (const tier of TIERS) {
      const rec = recorder();
      buildGoodsQuery(rec, RICH, tier);
      expect(candidateCalls(plan.candidate, tier), `tier=${tier ?? "none"}`).toEqual(
        rec.calls,
      );
    }
  });

  it("빈 intent도 현행 빌더와 일치한다(백스톱 정렬·상한만)", () => {
    const plan = buildQueryPlan(
      resolveIntent({ intent: EMPTY_INTENT, explicitPrice: false }),
      { decisive: false },
    );
    const rec = recorder();
    buildGoodsQuery(rec, EMPTY_INTENT);
    expect(candidateCalls(plan.candidate, undefined)).toEqual(rec.calls);
  });

  it("전체 실행 계획은 사용자 정렬과 소프트 주석(키워드·착용감)을 담는다", () => {
    const plan = buildQueryPlan(resolveIntent({ intent: RICH, explicitPrice: true }), {
      decisive: false,
    });
    expect(plan.userSort).toBe("review_count");
    expect(plan.soft.keywords).toEqual(["간지"]);
    expect(plan.soft.wearChars.두께).toEqual(["두꺼움"]);
    expect(plan.soft.degradedStyle).toBeUndefined(); // flag-off엔 강등 없음
  });
});

describe("buildQueryPlan — flag-on(결정화 하드 정책)", () => {
  const resolved = resolveIntent({ intent: RICH, explicitPrice: true });
  const plan = buildQueryPlan(resolved, { decisive: true });

  it("LLM 출처 하드값이 후보 계획에서 빠진다: 성별·사이즈·facet 하드·배제", () => {
    expect(plan.candidate.gender).toBeNull();
    expect(plan.candidate.sizeStd).toEqual([]);
    expect(plan.candidate.hardStyle).toEqual({
      colors: [],
      patterns: [],
      materials: [],
      fits: [],
    });
    expect(plan.candidate.excludeStyle.colors).toEqual([]);
    expect(plan.candidate.excludeTitle).toEqual([]);
  });

  it("결정적 출처는 유지된다: 브랜드·명시 가격·제목 토큰", () => {
    expect(plan.candidate.brand).toBe("데비웨어");
    expect(plan.candidate.priceMax).toBe(30000);
    expect(plan.candidate.titleTokens).toEqual(["드라이핏", "쿨링"]);
  });

  it("소프트 소비자 있는 LLM 스타일은 강등되어 소프트 주석으로 남는다", () => {
    expect(plan.soft.degradedStyle).toEqual({
      colors: ["블랙", "화이트"],
      patterns: ["스트라이프"],
      materials: ["폴리에스테르"],
      fits: ["오버"],
    });
  });

  it("비명시 가격(llm 출처)은 flag-on 후보 계획에서 빠진다", () => {
    const llmPrice = buildQueryPlan(
      resolveIntent({ intent: RICH, explicitPrice: false }),
      { decisive: true },
    );
    expect(llmPrice.candidate.priceMin).toBeNull();
    expect(llmPrice.candidate.priceMax).toBeNull();
  });

  it("사용자 정렬(LLM 유래)은 flag-on에서도 전체 계획에 유지된다", () => {
    expect(plan.userSort).toBe("review_count");
  });

  it("가교 단언: flag-on 계획의 호출열 = 라우트가 실제 조회하는 decisiveQueryIntent의 빌더 호출열", () => {
    // 게이트가 해시하는 계획과 라우트의 실제 조회가 같은 파생을 경유함을 고정한다.
    for (const tier of TIERS) {
      const rec = recorder();
      buildGoodsQuery(rec, decisiveQueryIntent(resolved), tier);
      expect(candidateCalls(plan.candidate, tier), `tier=${tier ?? "none"}`).toEqual(
        rec.calls,
      );
    }
  });

  it("facet_lexicon 출처 색은 flag-on 후보 계획에 하드로 남는다(값 단위 provenance)", () => {
    const base = resolveIntent({ intent: RICH, explicitPrice: true });
    const withLexicon = {
      ...base,
      meta: base.meta.map((m) =>
        m.path === "style.colors" && m.value === "블랙"
          ? { ...m, source: "facet_lexicon" as const }
          : m,
      ),
    };
    const p = buildQueryPlan(withLexicon, { decisive: true });
    expect(p.candidate.hardStyle.colors).toEqual(["블랙"]);
    expect(p.soft.degradedStyle?.colors).toEqual(["화이트"]); // llm 색만 강등
  });
});

describe("candidatePlanKey — 해시 재료", () => {
  it("같은 후보 계획은 같은 키, 조건이 다르면 다른 키", () => {
    const a = buildQueryPlan(resolveIntent({ intent: RICH, explicitPrice: true }), {
      decisive: false,
    });
    const b = buildQueryPlan(resolveIntent({ intent: RICH, explicitPrice: true }), {
      decisive: false,
    });
    const c = buildQueryPlan(
      resolveIntent({
        intent: { ...RICH, style: { ...RICH.style, colors: ["레드"] } },
        explicitPrice: true,
      }),
      { decisive: false },
    );
    expect(candidatePlanKey(a.candidate)).toBe(candidatePlanKey(b.candidate));
    expect(candidatePlanKey(a.candidate)).not.toBe(candidatePlanKey(c.candidate));
  });
});
