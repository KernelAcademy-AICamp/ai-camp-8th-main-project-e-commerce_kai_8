// 컬러웨이 결속 검색 계획(compile) — 해석 결과를 실행 가능한 계획으로 바꾼다.
// 계약(docs/design/2026-08-07-colorway-search-kickoff-decisions.md D6, 설계 §6):
//  ① 한 묶음(PrintClause)의 조건은 같은 프린트 객체 안에서 함께 성립해야 한다 — 분리 검사 금지.
//  ② 서로 다른 객체 요구(segment)는 묶음 복수 개로.
//  ③ 바탕색 단독 요청은 상품 수준 옷 색 검색(무지 포함) — 결속 불필요.
//  ④ 모든 enum은 런타임 재검증 — 어휘 밖 값은 계획에 들어가지 않는다(설계 §9-2).
//  ⑤ 강제 수준: 결정적 경로만 있으므로 전부 must. LLM should는 2차 출하선에서 확장.

import {
  type CanonColor,
  type GraphicType,
  isCanonColor,
  isGraphicType,
  isPlanPlacement,
  type PlanPlacement,
  VOCAB_VERSION,
} from "../data/colorway-vocab";
import {
  COLORWAY_RULES_VERSION,
  type ColorwayInterpretation,
} from "./colorway-interpret";

export interface PrintClause {
  /** 이 묶음이 성립해야 하는 컬러웨이(옷 바탕색). 빈 배열 = 제한 없음. */
  baseColors: CanonColor[];
  /** 같은 객체의 잉크색. colors_status=확인이 아닌 객체는 성립 불가. */
  printColors: CanonColor[];
  /** 같은 객체의 면. '전체'는 실행 시 앞·뒤·소매 모두 포함으로 변환(순서 무관). */
  placements: PlanPlacement[];
  /** 같은 객체의 그래픽 유형. */
  graphicTypes: GraphicType[];
  /** 속성 없이 프린팅 객체 존재만 요구(sides가 비어 있지 않은 객체). */
  printExists: boolean;
}

export interface ColorwaySearchPlan {
  /** 상품 수준 옷 색 검색(무지 포함) — base_colors 교집합. */
  productBaseColors: CanonColor[];
  /** 명시적 부정(원문 span 근거) — 결속 시 해당 컬러웨이 객체 배제 + 상품 수준 잔여 컬러웨이 요구. */
  mustNotBaseColors: CanonColor[];
  /** 객체 결속 묶음 — 각 묶음은 독립된 객체 존재 조건. */
  printClauses: PrintClause[];
  /** 계획 결정성 해시 — 로그·캐시·회귀 비교용. */
  planKey: string;
  versions: { vocab: string; rules: string };
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

export function compileColorwayPlan(
  interp: ColorwayInterpretation,
): ColorwaySearchPlan {
  // ④ 런타임 enum 재검증 — 어휘 밖 값은 어느 진입점에서도 계획에 들어가지 않는다.
  const baseValues = (values: string[]) => uniq(values.filter(isCanonColor));
  const positives = interp.conditions.filter((c) => c.polarity === "positive");
  const negatives = interp.conditions.filter((c) => c.polarity === "negative");

  const basePositive = uniq(
    positives.filter((c) => c.target === "base").flatMap((c) => baseValues(c.values)),
  );
  const mustNotBaseColors = uniq(
    negatives.filter((c) => c.target === "base").flatMap((c) => baseValues(c.values)),
  );

  // ② segment별로 프린트 측 조건을 묶는다.
  const segments = uniq(
    positives
      .filter((c) => c.target !== "base" && c.segment >= 0)
      .map((c) => c.segment),
  ).sort((a, b) => a - b);

  const printClauses: PrintClause[] = segments.map((seg) => {
    const inSeg = positives.filter((c) => c.segment === seg);
    return {
      // ① 바탕색은 모든 묶음에 결속 — 같은 객체의 base_colors 조건이 된다.
      baseColors: basePositive,
      printColors: uniq(
        inSeg.filter((c) => c.target === "print").flatMap((c) => baseValues(c.values)),
      ),
      placements: uniq(
        inSeg
          .filter((c) => c.target === "placement")
          .flatMap((c) => c.values.filter(isPlanPlacement)),
      ),
      graphicTypes: uniq(
        inSeg
          .filter((c) => c.target === "graphic")
          .flatMap((c) => c.values.filter(isGraphicType)),
      ),
      printExists: false,
    };
  });

  // 프린팅 언급만 있고 결속 속성이 없으면 존재 조건 하나를 만든다(예: "파스텔톤 프린팅 티").
  if (printClauses.length === 0 && interp.printMentioned) {
    printClauses.push({
      baseColors: basePositive,
      printColors: [],
      placements: [],
      graphicTypes: [],
      printExists: true,
    });
  }

  // ③ 결속 묶음이 없으면 바탕색은 상품 수준 검색(무지 포함).
  const productBaseColors = printClauses.length === 0 ? basePositive : [];

  const canonical = {
    productBaseColors: [...productBaseColors].sort(),
    mustNotBaseColors: [...mustNotBaseColors].sort(),
    printClauses: printClauses.map((c) => ({
      baseColors: [...c.baseColors].sort(),
      printColors: [...c.printColors].sort(),
      placements: [...c.placements].sort(),
      graphicTypes: [...c.graphicTypes].sort(),
      printExists: c.printExists,
    })),
    vocab: VOCAB_VERSION,
    rules: COLORWAY_RULES_VERSION,
  };

  return {
    productBaseColors,
    mustNotBaseColors,
    printClauses,
    planKey: `colorway-plan@${fnv1a32(JSON.stringify(canonical))}`,
    versions: { vocab: VOCAB_VERSION, rules: COLORWAY_RULES_VERSION },
  };
}

/** 계획이 비어 있으면(조건 없음) 컬러웨이 검색이 관여하지 않는다 — 기존 경로 그대로. */
export function isEmptyColorwayPlan(plan: ColorwaySearchPlan): boolean {
  return (
    plan.productBaseColors.length === 0 &&
    plan.mustNotBaseColors.length === 0 &&
    plan.printClauses.length === 0
  );
}
