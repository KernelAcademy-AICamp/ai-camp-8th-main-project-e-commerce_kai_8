// 컬러웨이 결속 레인 — 기존 검색과의 통합 지점(기본 꺼짐).
// 결정 기록 D3: 이 스위치(SEARCH_COLORWAY_LANE)는 "컬러웨이 데이터 검색 활성화" 축이다.
// LLM 의미 해석 모드(SEARCH_LLM_MODE, 2차 출하선)와 별개이며 SEARCH_DECISIVE_LANE도 재사용하지 않는다.
// 계약:
//  - 꺼짐(기본): 이 모듈의 어떤 해석·실행도 호출되지 않는다 — 현행 검색과 완전 동일.
//  - 켜짐: 결정적 해석 → 계획 컴파일 → 어댑터 실행(goods_no 집합) → 결과 교집합.
//  - 해석기가 소비한 표현은 제목 토큰 추출에서 제외한다(D4 조건 소유권).
//  - 실행 실패는 요청 실패가 아니라 "컬러웨이 필터 없음"으로 폴백한다(설계 §8.4).

import { toLegacyColorTerms } from "../data/colorway-vocab";
import { interpretColorwayQuery, particleVariants } from "./colorway-interpret";
import {
  type ColorwaySearchPlan,
  compileColorwayPlan,
  isEmptyColorwayPlan,
} from "./colorway-plan";

export function isColorwayLaneOn(env: Record<string, string | undefined>): boolean {
  return env.SEARCH_COLORWAY_LANE === "on";
}

export interface ColorwayLane {
  plan: ColorwaySearchPlan;
  /** 정규화 원문 — 명시적 패턴어 존재 판정 등에 사용. */
  rawQuery: string;
  /** 해석기가 소비한 원문 토큰 — 제목 토큰 추출의 consumed 목록에 합류시킨다. */
  consumedTokens: string[];
  /** 미해결·외부 맥락 표현(관측 로그·승격 후보 수집용). */
  unresolved: string[];
  external: string[];
}

/**
 * 켜짐 상태에서 쿼리를 해석해 레인 입력을 만든다.
 * 계획이 비어 있으면(컬러웨이 조건 없음) null — 기존 경로가 그대로 처리한다.
 * 반드시 isColorwayLaneOn 확인 후에만 호출할 것(꺼짐 미호출 계약).
 */
export function prepareColorwayLane(query: string): ColorwayLane | null {
  const interpretation = interpretColorwayQuery(query);
  const plan = compileColorwayPlan(interpretation);
  // 계획이 비어도 소비한 표현(미해결 등)이 있으면 lane을 유지한다 — 소비 span을 버리면
  // "와인색"·"프린트가 없는" 같은 표현이 제목 하드필터로 새어 잘못된 0건을 만든다(D4).
  if (isEmptyColorwayPlan(plan) && interpretation.consumedSpans.length === 0)
    return null;

  // 소비 span의 토큰(조사 잘림 가능: "블랙 바탕")을 기준으로, 원문 쿼리 토큰("바탕에")을
  // 역방향 매칭해 원형 그대로 담는다 — 제목 추출기는 raw 토큰으로 consumed를 비교한다.
  const text = query.normalize("NFKC");
  const spanTokens = new Set(
    interpretation.consumedSpans
      .map(([s, e]) => text.slice(s, e))
      .flatMap((span) => span.split(/\s+/))
      .filter((t) => t.length > 0)
      .flatMap((t) => particleVariants(t)),
  );
  const consumedTokens = text
    .split(/\s+/)
    .filter((t) => t.length > 0 && particleVariants(t).some((v) => spanTokens.has(v)));

  return {
    plan,
    rawQuery: text,
    consumedTokens: [...new Set(consumedTokens)],
    unresolved: interpretation.unresolved,
    external: interpretation.external,
  };
}

/**
 * 바탕색 단독 계획(결속 묶음 없음)의 기존 색 필터 이관 — 결정 기록 D7.
 * base_colors(라벨 12건)는 당분간 쓰지 않고, 전 카탈로그가 채워진 기존 colors 필드로 검색한다.
 * 결속 묶음이 있으면 null — 그 경로는 라벨(prints) 기반 어댑터가 담당한다.
 */
export function productColorOverride(
  lane: ColorwayLane,
): { colors: string[]; excludeColors: string[] } | null {
  if (lane.plan.printClauses.length > 0) return null;
  const colors = lane.plan.productBaseColors.flatMap(toLegacyColorTerms);
  const excludeColors = lane.plan.mustNotBaseColors.flatMap(toLegacyColorTerms);
  if (colors.length === 0 && excludeColors.length === 0) return null;
  return { colors, excludeColors };
}

/**
 * 결속(printClause) 계획이 소유한 색·패턴 — D4 조건 소유권 확장.
 * 이 값들은 컬러웨이 레인이 프린트/바탕 결속으로 정확히 처리하므로, LLM의 평면
 * style.colors·patterns 하드필터에서 제거해야 한다(이중 필터 충돌·바탕/프린트 혼동 방지).
 * 결속이 없는(바탕색 단독) 계획은 D7 flat 이관이 담당하므로 여기서 소유하지 않는다(null).
 */
// 명시적 패턴/그래픽 유형 어휘(원문에 있으면 LLM 평면 패턴을 정당한 신호로 인정).
const EXPLICIT_PATTERN_WORDS = [
  "로고",
  "그래픽",
  "레터링",
  "캐릭터",
  "스트라이프",
  "줄무늬",
  "도트",
  "땡땡이",
  "체크",
  "격자",
  "배색",
  "카모",
  "위장",
  "그라데이션",
  "옴브레",
  "타이다이",
  "패치워크",
  "플라워",
  "꽃",
  "페이즐리",
  "체크무늬",
  "단색",
  "무지",
  "민무늬",
];

export function colorwayOwnedFilters(
  lane: ColorwayLane,
): { colors: string[]; stripAllPatterns: boolean } | null {
  if (lane.plan.printClauses.length === 0) return null;
  const colors = new Set<string>();
  for (const c of lane.plan.printClauses) {
    for (const v of c.printColors) toLegacyColorTerms(v).forEach((t) => colors.add(t));
    for (const v of c.baseColors) toLegacyColorTerms(v).forEach((t) => colors.add(t));
  }
  // bare '프린팅'만 있고 명시적 패턴어가 원문에 없으면, LLM이 프린팅→로고/그래픽·프린트로
  // 과해석한 평면 패턴은 노이즈다(printExists가 이미 처리) → 전부 제거해 호출 간 변동을 없앤다.
  const hasExplicitPattern = EXPLICIT_PATTERN_WORDS.some((w) =>
    lane.rawQuery.includes(w),
  );
  return { colors: [...colors], stripAllPatterns: !hasExplicitPattern };
}

/**
 * 표시 이미지(색 매칭 썸네일) 선택용 바탕색 — 하드필터 소유권과 무관하게 계획에서 뽑는다.
 * D4 소유권(colorwayOwnedFilters)은 "결속을 이중 하드필터로 걸지 않기" 위한 규칙이라
 * intent.style.colors를 비운다. 그 규칙을 조언 층(사진 고르기)까지 적용하면 "검정 프린팅 티"
 * 질의가 다른 색 사진을 내보낸다 — 조언 층은 계획의 바탕색을 직접 받는다.
 * 잉크색(printColors)은 옷 색이 아니므로 넣지 않는다.
 */
export function colorwayDisplayColors(lane: ColorwayLane): {
  colors: string[];
  excludeColors: string[];
} {
  const colors = new Set<string>();
  for (const c of lane.plan.productBaseColors)
    toLegacyColorTerms(c).forEach((t) => colors.add(t));
  for (const clause of lane.plan.printClauses)
    for (const c of clause.baseColors)
      toLegacyColorTerms(c).forEach((t) => colors.add(t));
  return {
    colors: [...colors],
    excludeColors: lane.plan.mustNotBaseColors.flatMap(toLegacyColorTerms),
  };
}

/** 어댑터 실행 함수 타입 — route가 supabase 어댑터를 주입한다(테스트는 대역 주입). */
export type ColorwayExecutor = (plan: ColorwaySearchPlan) => Promise<Set<number>>;

/**
 * 레인 실행 — 성공 시 일치 goods_no 집합, 실패 시 null(필터 미적용 폴백).
 * 실패를 예외로 올리지 않는다: 컬러웨이 레인 장애가 검색 요청을 죽이면 안 된다.
 */
export async function runColorwayLane(
  executor: ColorwayExecutor,
  lane: ColorwayLane,
): Promise<Set<number> | null> {
  try {
    return await executor(lane.plan);
  } catch {
    return null;
  }
}

/** 결과 교집합 — matched가 null(폴백)이면 원본 그대로. */
export function applyColorwayMatches<T extends { goodsNo: string }>(
  results: T[],
  matched: Set<number> | null,
): T[] {
  if (matched === null) return results;
  return results.filter((g) => matched.has(Number(g.goodsNo)));
}
