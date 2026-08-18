// 어댑터 검증(계획 6단계, DB 없이):
//  ① 사전필터는 superset — 기준 판정기가 참으로 판정하는 상품을 절대 놓치지 않는다.
//  ② 재판정 결과 ≡ 기준 판정기 결과.
//  ③ 포함 검사 객체가 결속 의미를 유지한다(단일 값 필드만, 다후보는 미룸).
// jsonb @>·&&·<@ 의미는 Postgres 규칙대로 시뮬레이션한다(라이브 스모크는 별도 env-gated 테스트).
import { describe, expect, it } from "vitest";

import type { ColorwayProductRow, PrintElement } from "../domain/colorway-evaluate";
import { evaluateColorwayPlan } from "../domain/colorway-evaluate";
import { interpretColorwayQuery } from "../domain/colorway-interpret";
import { compileColorwayPlan } from "../domain/colorway-plan";
import {
  applyColorwayPrefilter,
  buildClauseContainment,
  type ColorwayFilterable,
  type PrintsContainment,
  refineColorwayRows,
} from "./colorway-adapter";

const plan = (q: string) => compileColorwayPlan(interpretColorwayQuery(q));

// ── jsonb 시뮬레이터: Postgres containment 의미 재현(테스트 전용) ─────────────────

function jsonbElementContains(el: PrintElement, obj: PrintsContainment): boolean {
  return Object.entries(obj).every(([k, v]) => {
    const cur = (el as unknown as Record<string, unknown>)[k];
    if (Array.isArray(v)) {
      return Array.isArray(cur) && v.every((item) => (cur as unknown[]).includes(item));
    }
    return cur === v;
  });
}

/** 사전필터 시뮬레이션 빌더 — supabase-js 대신 필터 술어를 쌓는다. */
class SimQuery implements ColorwayFilterable {
  predicates: ((row: ColorwayProductRow) => boolean)[] = [];

  overlaps(column: string, value: string[]): this {
    this.predicates.push((row) => {
      const cur = (row as unknown as Record<string, unknown>)[column];
      return Array.isArray(cur) && value.some((v) => (cur as unknown[]).includes(v));
    });
    return this;
  }

  contains(column: string, value: unknown): this {
    this.predicates.push((row) => {
      const cur = (row as unknown as Record<string, unknown>)[column];
      if (!Array.isArray(cur)) return false;
      // 어댑터는 jsonb 값을 JSON 문자열로 전달한다 — Postgres와 같은 방식으로 해석.
      const objs = JSON.parse(String(value)) as PrintsContainment[];
      return objs.every((obj) =>
        (cur as PrintElement[]).some((el) => jsonbElementContains(el, obj)),
      );
    });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    this.predicates.push((row) => {
      const cur = (row as unknown as Record<string, unknown>)[column];
      if (operator === "is" && value === null) return cur !== null;
      if (operator === "cd") {
        // not contained-by: cur ⊆ value 가 아니어야 한다.
        const set = String(value).replace(/[{}]/g, "").split(",").filter(Boolean);
        return !(Array.isArray(cur) && (cur as string[]).every((c) => set.includes(c)));
      }
      throw new Error(`미지원 연산자: ${operator}`);
    });
    return this;
  }

  run(rows: ColorwayProductRow[]): ColorwayProductRow[] {
    return rows.filter((r) => this.predicates.every((p) => p(r)));
  }
}

// ── fixture: 진리표와 같은 합성 상품군 ─────────────────────────────────────────

const FIXTURES: ColorwayProductRow[] = [
  {
    goods_no: 100,
    colors: ["화이트", "블랙", "그레이"],
    prints: [
      {
        base_colors: ["화이트"],
        sides: ["앞"],
        graphic_types: ["레터링"],
        colors: ["그린"],
        colors_status: "확인",
      },
      {
        base_colors: ["블랙"],
        sides: ["앞"],
        graphic_types: ["레터링"],
        colors: ["화이트"],
        colors_status: "확인",
      },
      {
        base_colors: ["그레이"],
        sides: ["앞"],
        graphic_types: ["레터링"],
        colors: ["네이비"],
        colors_status: "확인",
      },
    ],
  },
  {
    goods_no: 200,
    colors: ["블랙"],
    prints: [
      {
        base_colors: ["블랙"],
        sides: ["앞"],
        graphic_types: ["로고"],
        colors: ["화이트"],
        colors_status: "확인",
      },
      {
        base_colors: ["블랙"],
        sides: ["뒤"],
        graphic_types: ["캐릭터"],
        colors: ["레드"],
        colors_status: "확인",
      },
    ],
  },
  {
    goods_no: 300,
    colors: ["블랙"],
    prints: [
      {
        base_colors: ["블랙"],
        sides: ["뒤"],
        graphic_types: ["레터링"],
        colors: null,
        colors_status: "판독불가",
      },
    ],
  },
  {
    goods_no: 400,
    colors: ["화이트"],
    prints: [
      {
        base_colors: ["화이트"],
        sides: [],
        graphic_types: ["배색"],
        colors: [],
        colors_status: "없음",
      },
    ],
  },
  {
    goods_no: 500,
    colors: ["그린"],
    prints: [
      {
        base_colors: ["그린"],
        sides: ["소매", "앞", "뒤"],
        graphic_types: ["그래픽"],
        colors: ["화이트"],
        colors_status: "확인",
      },
    ],
  },
  { goods_no: 600, colors: ["블랙", "화이트"], prints: [] },
  { goods_no: 700, colors: ["블루"], prints: null },
];

const QUERIES = [
  "블랙 바탕에 화이트 프린팅",
  "블랙 바탕에 그린 프린팅",
  "화이트 바탕에 그린 프린팅",
  "앞에는 흰 로고 뒤에는 빨간 캐릭터",
  "블랙 바탕에 화이트 백프린팅",
  "백프린팅 티셔츠",
  "소매 프린팅 있는 티",
  "올오버 프린팅 티",
  "블랙 티셔츠",
  "검정 바탕 말고 화이트 프린팅 티",
  "파스텔톤 프린팅 티",
  "화이트 바탕 스트라이프 티",
];

describe("colorway-adapter", () => {
  it("포함 검사 객체: 단일 값만 넣고 바탕색(매핑 판정)·다후보·printExists는 재판정으로 미룬다", () => {
    const p = plan("블랙 바탕에 화이트 백프린팅");
    expect(buildClauseContainment(p.printClauses[0])).toEqual({
      colors: ["화이트"],
      colors_status: "확인",
      sides: ["뒤"],
    });

    const exists = plan("파스텔톤 프린팅 티");
    expect(buildClauseContainment(exists.printClauses[0])).toBeNull();

    const allOver = plan("올오버 프린팅 티");
    expect(buildClauseContainment(allOver.printClauses[0])).toEqual({
      sides: ["앞", "뒤", "소매"],
    });
  });

  it("superset 속성: 기준 판정기가 참인 상품은 사전필터를 반드시 통과한다", () => {
    for (const q of QUERIES) {
      const p = plan(q);
      const truth = evaluateColorwayPlan(FIXTURES, p);
      const prefiltered = applyColorwayPrefilter(new SimQuery(), p)
        .run(FIXTURES)
        .map((r) => r.goods_no);
      for (const goodsNo of truth) {
        expect(
          prefiltered,
          `쿼리 "${q}"에서 사전필터가 참 일치 ${String(goodsNo)}를 놓침`,
        ).toContain(goodsNo);
      }
    }
  });

  it("재판정 결과 ≡ 기준 판정기 결과", () => {
    for (const q of QUERIES) {
      const p = plan(q);
      const truth = evaluateColorwayPlan(FIXTURES, p);
      const prefiltered = applyColorwayPrefilter(new SimQuery(), p).run(FIXTURES);
      const refined = refineColorwayRows(prefiltered, p).map((r) => r.goods_no);
      expect(refined.sort(), `쿼리 "${q}"`).toEqual([...truth].sort());
    }
  });
});
