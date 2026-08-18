import { describe, expect, it } from "vitest";

import {
  decisiveQueryIntent,
  decisiveResponseIntent,
  hasGroundedSignal,
  isDecisiveLaneOn,
} from "@/features/search/domain/decisive-lane";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { resolveIntent } from "@/features/search/domain/resolved-intent";

const LLM_ONLY: QueryIntent = {
  ...EMPTY_INTENT,
  gender: "남성",
  sizeStd: [105],
  priceMax: 20000,
  style: { ...EMPTY_INTENT.style, colors: ["블랙"], keywords: ["간지"] },
  exclude: { ...EMPTY_INTENT.exclude, colors: ["옐로우"], keywords: ["나염"] },
  wearChars: { ...EMPTY_INTENT.wearChars, 두께: ["두꺼움"] },
};

const WITH_DETERMINISTIC: QueryIntent = {
  ...LLM_ONLY,
  brand: "데비웨어",
  titleTokens: ["드라이핏"],
};

describe("isDecisiveLaneOn — 환경변수 스위치(기본 off)", () => {
  it("'on'일 때만 켜진다", () => {
    expect(isDecisiveLaneOn({ SEARCH_DECISIVE_LANE: "on" })).toBe(true);
    expect(isDecisiveLaneOn({ SEARCH_DECISIVE_LANE: "off" })).toBe(false);
    expect(isDecisiveLaneOn({ SEARCH_DECISIVE_LANE: "1" })).toBe(false);
    expect(isDecisiveLaneOn({})).toBe(false);
  });
});

describe("hasGroundedSignal — grounded 신호(결정적 출처 ≥1)", () => {
  it("LLM-only 값만 있으면 신호가 아니다", () => {
    expect(
      hasGroundedSignal(resolveIntent({ intent: LLM_ONLY, explicitPrice: false })),
    ).toBe(false);
  });

  it("브랜드(사전)·제목 토큰(휴리스틱)·명시 가격(정규식)은 각각 신호다", () => {
    expect(
      hasGroundedSignal(
        resolveIntent({
          intent: { ...EMPTY_INTENT, brand: "데비웨어" },
          explicitPrice: false,
        }),
      ),
    ).toBe(true);
    expect(
      hasGroundedSignal(
        resolveIntent({
          intent: { ...EMPTY_INTENT, titleTokens: ["드라이핏"] },
          explicitPrice: false,
        }),
      ),
    ).toBe(true);
    expect(
      hasGroundedSignal(
        resolveIntent({
          intent: { ...EMPTY_INTENT, priceMax: 20000 },
          explicitPrice: true,
        }),
      ),
    ).toBe(true);
  });
});

describe("decisiveQueryIntent — flag-on 조회용 intent(하드 정책)", () => {
  const q = decisiveQueryIntent(
    resolveIntent({ intent: WITH_DETERMINISTIC, explicitPrice: false }),
  );

  it("LLM 하드값이 조회에서 빠진다: facet·성별·사이즈·배제·비명시 가격", () => {
    expect(q.style.colors).toEqual([]);
    expect(q.gender).toBeUndefined();
    expect(q.sizeStd).toEqual([]);
    expect(q.exclude).toEqual(EMPTY_INTENT.exclude);
    expect(q.priceMax).toBeUndefined();
  });

  it("결정적 출처와 소프트 재료·정렬은 유지된다", () => {
    expect(q.brand).toBe("데비웨어");
    expect(q.titleTokens).toEqual(["드라이핏"]);
    expect(q.style.keywords).toEqual(["간지"]); // 소프트 랭킹 재료
    expect(q.wearChars.두께).toEqual(["두꺼움"]);
    expect(q.sort).toBe(WITH_DETERMINISTIC.sort);
  });

  it("명시 가격(정규식 출처)은 조회에 유지된다", () => {
    const withPrice = decisiveQueryIntent(
      resolveIntent({ intent: WITH_DETERMINISTIC, explicitPrice: true }),
    );
    expect(withPrice.priceMax).toBe(20000);
  });
});

describe("decisiveResponseIntent — flag-on 응답 intent(resolved 계약)", () => {
  const r = decisiveResponseIntent(
    resolveIntent({ intent: WITH_DETERMINISTIC, explicitPrice: false }),
  );

  it("미적용 LLM 값(성별·사이즈·배제·비명시 가격)은 응답에서 제거된다 — 칩 미표시", () => {
    expect(r.gender).toBeUndefined();
    expect(r.sizeStd).toEqual([]);
    expect(r.exclude).toEqual(EMPTY_INTENT.exclude);
    expect(r.priceMax).toBeUndefined();
  });

  it("소프트로 반영된 LLM 스타일·착용감·키워드와 결정적 값은 응답에 유지된다", () => {
    expect(r.style.colors).toEqual(["블랙"]); // 소프트 강등돼도 랭킹 반영 → 칩 유지
    expect(r.style.keywords).toEqual(["간지"]);
    expect(r.wearChars.두께).toEqual(["두꺼움"]);
    expect(r.brand).toBe("데비웨어");
    expect(r.titleTokens).toEqual(["드라이핏"]);
  });
});

describe("provenance 단일 근거 — 값 단위 출처로 판정(축 통째 제거 금지)", () => {
  // 3a 이후를 모사: 색 하나가 facet 사전 출처로 추출된 ResolvedIntent.
  function withLexiconColor() {
    const base = resolveIntent({
      intent: {
        ...EMPTY_INTENT,
        gender: "남성",
        style: { ...EMPTY_INTENT.style, colors: ["블랙", "레드"] },
      },
      explicitPrice: false,
    });
    return {
      ...base,
      meta: base.meta.map((m) =>
        m.path === "style.colors" && m.value === "블랙"
          ? { ...m, source: "facet_lexicon" as const }
          : m,
      ),
    };
  }

  it("facet_lexicon 색은 flag-on 조회에서 하드로 유지되고, llm 색만 강등된다", () => {
    const q = decisiveQueryIntent(withLexiconColor());
    expect(q.style.colors).toEqual(["블랙"]);
    expect(q.gender).toBeUndefined(); // llm 성별은 여전히 제거
  });

  it("facet_lexicon 색은 grounded 신호다", () => {
    expect(hasGroundedSignal(withLexiconColor())).toBe(true);
  });
});

describe("promote — flag-on에서는 LLM promote를 무시한다(유령 상태 방지)", () => {
  const promoted = resolveIntent({
    intent: {
      ...EMPTY_INTENT,
      brand: "데비웨어",
      style: { ...EMPTY_INTENT.style, colors: ["블랙"] },
      promote: ["colors"],
    },
    explicitPrice: false,
  });

  it("조회·응답 intent 모두 promote가 빈다 — 색은 소프트 강등(가점 스킵 방지)+칩 유지", () => {
    expect(decisiveQueryIntent(promoted).promote).toEqual([]);
    const r = decisiveResponseIntent(promoted);
    expect(r.promote).toEqual([]);
    expect(r.style.colors).toEqual(["블랙"]);
  });
});

describe("enforcement 존중 — 결정적이어도 soft면 하드 후보가 아니다(소재·핏 하드 금지)", () => {
  // 3a 이후를 모사: 소재가 facet 사전으로 추출됐지만 hard-safe 미달이라 soft enforcement.
  function withSoftLexiconMaterial() {
    const base = resolveIntent({
      intent: {
        ...EMPTY_INTENT,
        style: { ...EMPTY_INTENT.style, materials: ["폴리에스테르"] },
      },
      explicitPrice: false,
    });
    return {
      ...base,
      meta: base.meta.map((m) =>
        m.path === "style.materials"
          ? { ...m, source: "facet_lexicon" as const, enforcement: "soft" as const }
          : m,
      ),
    };
  }

  it("soft enforcement 결정값은 flag-on 조회 하드에서 제외된다", () => {
    expect(decisiveQueryIntent(withSoftLexiconMaterial()).style.materials).toEqual([]);
  });

  it("단 결정적 추출이므로 grounded 신호로는 인정된다", () => {
    expect(hasGroundedSignal(withSoftLexiconMaterial())).toBe(true);
  });
});

describe("sort-only 회귀 — 정렬은 출처와 무관하게 신호가 아니다", () => {
  it("rule_parser 출처 정렬만 있으면 grounded 신호가 아니다(3b 대비)", () => {
    const base = resolveIntent({
      intent: { ...EMPTY_INTENT, sort: "review_count" },
      explicitPrice: false,
    });
    const parserSort = {
      ...base,
      meta: base.meta.map((m) =>
        m.path === "sort" ? { ...m, source: "rule_parser" as const } : m,
      ),
    };
    expect(hasGroundedSignal(parserSort)).toBe(false);
  });
});
