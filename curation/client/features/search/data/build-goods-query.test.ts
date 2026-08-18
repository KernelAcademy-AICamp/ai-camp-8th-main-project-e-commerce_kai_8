import { describe, expect, it } from "vitest";

import {
  buildGoodsQuery,
  type GoodsQuery,
  pgArray,
} from "@/features/search/data/build-goods-query";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";

type Call = [string, ...unknown[]];

// GoodsQuery를 만족하는 기록용 더블 — 호출을 순서대로 기록하고 자기 자신을 반환.
function recorder(): GoodsQuery & { calls: Call[] } {
  const calls: Call[] = [];
  const self = {
    calls,
    eq(c: string, v: unknown) {
      calls.push(["eq", c, v]);
      return self;
    },
    or(f: string) {
      calls.push(["or", f]);
      return self;
    },
    gte(c: string, v: unknown) {
      calls.push(["gte", c, v]);
      return self;
    },
    lte(c: string, v: unknown) {
      calls.push(["lte", c, v]);
      return self;
    },
    overlaps(c: string, v: readonly unknown[]) {
      calls.push(["overlaps", c, [...v]]);
      return self;
    },
    not(c: string, op: string, v: unknown) {
      calls.push(["not", c, op, v]);
      return self;
    },
    ilike(c: string, p: string) {
      calls.push(["ilike", c, p]);
      return self;
    },
    order(c: string, o: { ascending: boolean }) {
      calls.push(["order", c, o]);
      return self;
    },
    limit(n: number) {
      calls.push(["limit", n]);
      return self;
    },
  };
  return self;
}
function intent(p: Partial<QueryIntent>): QueryIntent {
  return {
    ...EMPTY_INTENT,
    ...p,
    style: { ...EMPTY_INTENT.style, ...(p.style ?? {}) },
    exclude: { ...EMPTY_INTENT.exclude, ...(p.exclude ?? {}) },
  };
}

describe("pgArray", () => {
  it("값을 큰따옴표로 감싼 배열 리터럴", () => {
    expect(pgArray(["블랙", "스카이 블루"])).toBe('{"블랙","스카이 블루"}');
  });
});

describe("buildGoodsQuery", () => {
  it("빈 intent도 order·limit 백스톱을 건다(review_score desc, 그다음 goods_no asc)", () => {
    const r = recorder();
    buildGoodsQuery(r, EMPTY_INTENT);
    expect(r.calls).toContainEqual(["order", "review_score", { ascending: false }]);
    expect(r.calls).toContainEqual(["order", "goods_no", { ascending: true }]);
    expect(r.calls).toContainEqual(["limit", 3000]);
  });

  it("하드 필터: gender·size(or)·price", () => {
    const r = recorder();
    buildGoodsQuery(
      r,
      intent({ gender: "남성", sizeStd: [95, 100], priceMin: 10000, priceMax: 40000 }),
    );
    expect(r.calls).toContainEqual(["eq", "gender", "남성"]);
    expect(r.calls).toContainEqual(["or", "size_std.ov.{95,100},size_free.eq.true"]);
    expect(r.calls).toContainEqual(["gte", "price", 10000]);
    expect(r.calls).toContainEqual(["lte", "price", 40000]);
  });

  it("스타일(색·패턴·소재·핏)은 항상 overlaps 하드필터, keywords는 소프트 유지", () => {
    const r = recorder();
    buildGoodsQuery(
      r,
      intent({
        style: {
          colors: ["화이트"],
          patterns: [],
          materials: ["면"],
          fits: ["오버"],
          keywords: ["빈티지"],
        },
      }),
    );
    // 색·소재·핏 모두 하드필터(promote 없이도)
    expect(r.calls).toContainEqual(["overlaps", "colors", ["화이트"]]);
    expect(r.calls).toContainEqual(["overlaps", "materials", ["면"]]);
    expect(r.calls).toContainEqual(["overlaps", "fits", ["오버"]]);
    // 빈 배열(patterns)은 필터 안 함
    expect(
      r.calls.find((c) => c[0] === "overlaps" && c[1] === "patterns"),
    ).toBeUndefined();
    // keywords는 하드 승격 안 함(소프트 랭킹)
    expect(
      r.calls.find((c) => c[0] === "overlaps" && c[1] === "keywords"),
    ).toBeUndefined();
  });

  it("exclude: 배열은 not.ov, 키워드는 not.ilike", () => {
    const r = recorder();
    buildGoodsQuery(
      r,
      intent({
        exclude: {
          colors: ["블랙"],
          patterns: [],
          materials: ["면"],
          fits: [],
          keywords: ["로고"],
        },
      }),
    );
    expect(r.calls).toContainEqual(["not", "colors", "ov", '{"블랙"}']);
    expect(r.calls).toContainEqual(["not", "materials", "ov", '{"면"}']);
    expect(r.calls).toContainEqual(["not", "title", "ilike", "%로고%"]);
  });

  it("exclude.keywords도 LIKE 와일드카드를 이스케이프한다", () => {
    const r = recorder();
    buildGoodsQuery(
      r,
      intent({
        exclude: {
          colors: [],
          patterns: [],
          materials: [],
          fits: [],
          keywords: ["100%"],
        },
      }),
    );
    expect(r.calls).toContainEqual(["not", "title", "ilike", "%100\\%%"]);
  });
});

describe("buildGoodsQuery wear-chars 불변식·후보 상한", () => {
  it("wearChars가 있어도 wear 관련 필터를 만들지 않는다(soft-only)", () => {
    const r = recorder();
    buildGoodsQuery(
      r,
      intent({ wearChars: { ...EMPTY_INTENT.wearChars, 촉감: ["부드러움"] } }),
    );
    const mentionsWear = r.calls.some((c) =>
      c.some((a) => typeof a === "string" && a.includes("wear")),
    );
    expect(mentionsWear).toBe(false);
  });

  it("클라이언트가 코퍼스보다 큰 상한을 요청한다(단, 서버 max_rows=1000이 실질 상한 — 1.5b)", () => {
    // 이 테스트는 클라가 보내는 .limit 인자만 검증한다. 실제 반환 행 수는
    // PostgREST max_rows(=1000)로 잘리므로 이 값(>=2500)이 곧 recall 커버리지는 아니다.
    // build-goods-query.ts 주석 참고. 전체 후보화는 Phase 1.5b.
    const r = recorder();
    buildGoodsQuery(r, EMPTY_INTENT);
    const limitCall = r.calls.find((c) => c[0] === "limit");
    expect(limitCall?.[1]).toBeGreaterThanOrEqual(2500);
  });
});

describe("buildGoodsQuery — 브랜드 하드필터", () => {
  it("intent.brand가 있으면 eq('brand', 값)", () => {
    const r = recorder();
    buildGoodsQuery(r, intent({ brand: "무신사 스탠다드" }));
    expect(r.calls).toContainEqual(["eq", "brand", "무신사 스탠다드"]);
  });

  it("brand가 없으면 brand eq 없음", () => {
    const r = recorder();
    buildGoodsQuery(r, EMPTY_INTENT);
    expect(r.calls.some(([m, c]) => m === "eq" && c === "brand")).toBe(false);
  });

  it("특수문자 브랜드명도 값 그대로 eq에 전달(escaping 불필요 검증)", () => {
    const r = recorder();
    const weird = `브랜드,쉼표 "따옴표" (괄호) 100%`;
    buildGoodsQuery(r, intent({ brand: weird }));
    expect(r.calls).toContainEqual(["eq", "brand", weird]);
  });
});

describe("buildGoodsQuery — 제목 tier", () => {
  const titleIntent = { ...EMPTY_INTENT, titleTokens: ["드라이핏", "쿨링"] };

  it("phrase: 전체 구문 ilike 1회", () => {
    const r = recorder();
    buildGoodsQuery(r, titleIntent, "phrase");
    expect(r.calls).toContainEqual(["ilike", "title", "%드라이핏 쿨링%"]);
  });

  it("and: 토큰별 ilike 체이닝", () => {
    const r = recorder();
    buildGoodsQuery(r, titleIntent, "and");
    expect(r.calls).toContainEqual(["ilike", "title", "%드라이핏%"]);
    expect(r.calls).toContainEqual(["ilike", "title", "%쿨링%"]);
  });

  it("or: orIlikeTitle 필터 문자열", () => {
    const r = recorder();
    buildGoodsQuery(r, titleIntent, "or");
    expect(r.calls).toContainEqual([
      "or",
      'title.ilike."%드라이핏%",title.ilike."%쿨링%"',
    ]);
  });

  it("titleTier 없으면 title 조건 없음(하위호환)", () => {
    const r = recorder();
    buildGoodsQuery(r, titleIntent);
    expect(r.calls.some(([m, c]) => m === "ilike" && c === "title")).toBe(false);
  });

  it("titleTokens 비어 있으면 tier 지정해도 조건 없음", () => {
    const r = recorder();
    buildGoodsQuery(r, EMPTY_INTENT, "and");
    expect(r.calls.some(([m]) => m === "ilike")).toBe(false);
  });

  it("LIKE 와일드카드 이스케이프", () => {
    const r = recorder();
    buildGoodsQuery(r, { ...EMPTY_INTENT, titleTokens: ["100%"] }, "and");
    expect(r.calls).toContainEqual(["ilike", "title", "%100\\%%"]);
  });
});
