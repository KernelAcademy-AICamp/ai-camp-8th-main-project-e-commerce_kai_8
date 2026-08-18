// execution-bundle.test.ts
import { describe, expect, it } from "vitest";

import { adaptSemanticPlan } from "./adapt-semantic-plan";
import { compileAtomic } from "./compile-atomic";
import { compileSemanticPlan } from "./compile-semantic-plan";
import {
  buildSemanticBundle,
  evaluateSemanticPlan,
  simulateSemanticRerank,
} from "./execution-bundle";
import { buildQueryFrame } from "./query-frame";
import { EMPTY_INTENT, type QueryIntent } from "./query-intent";
import { deriveSemanticOwnership } from "./semantic-ownership";

const Q = "검은색이나 하얀색 무늬가 있는 빨간색 티셔츠";

function setup() {
  const f = buildQueryFrame(Q);
  const r = compileAtomic(f, {
    assignments: [
      { mentionRef: "m01", target: "print" },
      { mentionRef: "m02", target: "print" },
      { mentionRef: "m03", target: "base" },
    ],
    orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
  });
  if (!r.graph) throw new Error("fixture");
  const ownership = deriveSemanticOwnership(f, r.graph);
  const plan = adaptSemanticPlan(compileSemanticPlan(r.graph).printClauses);
  if (!plan) throw new Error("adapter");
  return { ownership, plan };
}

describe("buildSemanticBundle", () => {
  it("suppressedFlatAxes에 따라 평면 style.colors를 전량 제거", () => {
    const base: QueryIntent = {
      ...EMPTY_INTENT,
      style: { ...EMPTY_INTENT.style, colors: ["레드", "블랙"] },
    };
    const { ownership, plan } = setup();
    const b = buildSemanticBundle(base, [], ownership, plan, Q);
    expect(b.effectiveIntent.style.colors).toEqual([]); // colors 축 소유 → 전량 제거
  });

  it("BaseIntent를 변형하지 않고 중첩 배열도 공유하지 않는다", () => {
    const base: QueryIntent = {
      ...EMPTY_INTENT,
      style: { ...EMPTY_INTENT.style, colors: ["레드"] },
    };
    const { ownership, plan } = setup();
    const b = buildSemanticBundle(base, [], ownership, plan, Q);
    expect(base.style.colors).toEqual(["레드"]); // 원본 불변
    expect(b.effectiveIntent.style).not.toBe(base.style); // 참조 미공유
  });

  it("titleTokens를 원문에서 재생성하고 색·관계어는 제외한다", () => {
    const base: QueryIntent = {
      ...EMPTY_INTENT,
      titleTokens: ["빨간색"], // 기존 값 — 필터링이 아니라 재생성 대상
      style: { ...EMPTY_INTENT.style, colors: ["레드"] },
    };
    const { ownership, plan } = setup();
    const b = buildSemanticBundle(base, [], ownership, plan, Q);
    // 색·무늬·티셔츠가 소비돼 남는 제목 토큰이 없어야 한다.
    expect(b.effectiveIntent.titleTokens ?? []).not.toContain("빨간색");
  });

  it("하드필터(gender·price)는 base와 동일하게 유지", () => {
    const base: QueryIntent = { ...EMPTY_INTENT, gender: "여성", priceMax: 20000 };
    const { ownership, plan } = setup();
    const b = buildSemanticBundle(base, [], ownership, plan, Q);
    expect(b.effectiveIntent.gender).toBe("여성");
    expect(b.effectiveIntent.priceMax).toBe(20000);
  });
});

describe("simulateSemanticRerank", () => {
  const rows = (nos: number[]) => nos.map((n) => ({ goodsNo: String(n) }));

  it("match를 앞으로, unmatch는 뒤에 stable partition(제거 없음)", () => {
    const off = rows([1, 2, 3, 4, 5]);
    const r = simulateSemanticRerank(off, new Set([3, 5]));
    expect(r.reranked.map((x) => x.goodsNo)).toEqual(["3", "5", "1", "2", "4"]);
    expect(r.matchedCount).toBe(2);
    expect(r.reranked).toHaveLength(off.length); // 아무것도 제거 안 됨
  });

  it("match 0이면 순서 유지(boost 없음)", () => {
    const off = rows([1, 2, 3]);
    const r = simulateSemanticRerank(off, new Set());
    expect(r.reranked.map((x) => x.goodsNo)).toEqual(["1", "2", "3"]);
    expect(r.matchedCount).toBe(0);
  });
});

describe("evaluateSemanticPlan", () => {
  const plan = {
    productBaseColors: [],
    mustNotBaseColors: [],
    printClauses: [],
    planKey: "sem@x",
    versions: { vocab: "v", rules: "r" },
  };
  let t = 0;
  const now = () => (t += 10);

  it("executor 성공 → success + matchedIds(빈 Set도 성공)", async () => {
    t = 0;
    const r = await evaluateSemanticPlan(
      plan,
      () => Promise.resolve(new Set([1, 2])),
      now,
    );
    expect(r.status).toBe("success");
    if (r.status === "success") {
      expect([...r.matchedIds]).toEqual([1, 2]);
      expect(r.latencyMs).toBe(10);
    }
  });

  it("빈 Set은 실패가 아니라 성공", async () => {
    const r = await evaluateSemanticPlan(
      plan,
      () => Promise.resolve(new Set()),
      () => 0,
    );
    expect(r.status).toBe("success");
  });

  it("executor 예외 → failure(stage=db)", async () => {
    const r = await evaluateSemanticPlan(
      plan,
      () => Promise.reject(new Error("db down")),
      () => 0,
    );
    expect(r.status).toBe("failure");
    if (r.status === "failure") expect(r.reason).toBe("db down");
  });
});
