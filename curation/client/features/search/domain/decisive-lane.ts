// 결정화 레인(flag-on) 정책 — 설계 §3.5·계획 v2.2 "flag-on의 세 가지 발효" 중
// ①grounded 신호 ②하드 조건 정책(LLM 출처 하드 불가) ③resolved 응답 계약을 담당한다.
// flag-off 경로는 이 모듈을 전혀 타지 않는다(현행 동작 보존).
// ⚠️ 판정의 단일 근거는 ConstraintMeta의 값 단위 출처다 — 축 통째 제거 금지.
//    3a(facet_lexicon 색)·3b(rule_parser 성별 등)가 추가되면 자동으로 하드에 남는다.
import type { QueryIntent, StyleFilter } from "@/features/search/domain/query-intent";
import type { ResolvedIntent } from "@/features/search/domain/resolved-intent";

// 서버 전용 환경변수 — 값이 정확히 "on"일 때만 켜진다(기본 off, 프로덕션 P3-F 기간 off 고정).
export function isDecisiveLaneOn(env: Record<string, string | undefined>): boolean {
  return env.SEARCH_DECISIVE_LANE === "on";
}

// grounded 신호(설계 §3.5) — 결정적 출처의 "조건" 값이 하나 이상 있어야 검색 신호.
// 정렬은 조건이 아니므로 출처와 무관하게 신호가 아니다(sort-only는 failed — 현행 계약 유지,
// 3b에서 rule_parser 정렬이 생겨도 이 판정은 흔들리지 않는다).
export function hasGroundedSignal(resolved: ResolvedIntent): boolean {
  return resolved.meta.some((m) => m.source !== "llm" && m.path !== "sort");
}

// path의 값들 중 하드 후보 자격이 있는 것만 남긴다 — 값 단위 provenance 필터.
// 자격 = 비 LLM 출처 AND enforcement가 hard. 결정적으로 추출됐어도 hard-safe 미달 축
// (소재·핏 등)은 soft enforcement로 내려오므로 하드필터가 되면 안 된다(§3.2 게이트).
function grounded(resolved: ResolvedIntent, path: string): (string | number)[] {
  return resolved.meta
    .filter((m) => m.path === path && m.source !== "llm" && m.enforcement === "hard")
    .map((m) => m.value);
}

function groundedStrings(resolved: ResolvedIntent, path: string): string[] {
  return grounded(resolved, path).map(String);
}

function groundedNumbers(resolved: ResolvedIntent, path: string): number[] {
  return grounded(resolved, path).map(Number);
}

function groundedStyle(
  resolved: ResolvedIntent,
  prefix: "style" | "exclude",
  keywords: string[],
): StyleFilter {
  return {
    colors: groundedStrings(resolved, `${prefix}.colors`),
    patterns: groundedStrings(resolved, `${prefix}.patterns`),
    materials: groundedStrings(resolved, `${prefix}.materials`),
    fits: groundedStrings(resolved, `${prefix}.fits`),
    keywords,
  };
}

// flag-on 조회용 intent — LLM 출처 하드값만 제거하고 결정적 출처 값은 하드로 유지.
// keywords·wearChars는 조회에 안 쓰이는 소프트 재료라 유지, 정렬은 예외적으로 유지.
// promote는 LLM 유래라 무시(하드 승격 금지 + score-row의 가점 스킵 방지 — 유령 상태 차단).
export function decisiveQueryIntent(resolved: ResolvedIntent): QueryIntent {
  const { intent } = resolved;
  return {
    ...intent,
    gender: grounded(resolved, "gender").length ? intent.gender : undefined,
    sizeStd: groundedNumbers(resolved, "sizeStd"),
    priceMin: groundedNumbers(resolved, "priceMin")[0],
    priceMax: groundedNumbers(resolved, "priceMax")[0],
    style: groundedStyle(resolved, "style", intent.style.keywords),
    exclude: groundedStyle(
      resolved,
      "exclude",
      groundedStrings(resolved, "exclude.keywords"),
    ),
    promote: [],
  };
}

// flag-on 응답 intent(resolved 계약) — 실제 적용됐거나 소프트로 반영된 값만 담는다.
// 소프트 소비자 없는 축의 LLM 값(성별·사이즈·배제·비명시 가격)은 제거 → 칩 미표시.
// 소프트 강등된 스타일(색 등)은 랭킹에 반영되므로 유지 → "적용된 조건 = 표시된 칩".
export function decisiveResponseIntent(resolved: ResolvedIntent): QueryIntent {
  const { intent } = resolved;
  const q = decisiveQueryIntent(resolved);
  return {
    ...intent,
    gender: q.gender,
    sizeStd: q.sizeStd,
    priceMin: q.priceMin,
    priceMax: q.priceMax,
    // 스타일: 결정적 값(하드 적용) + LLM 값(소프트 강등 — 랭킹 반영) 모두 유지.
    style: intent.style,
    exclude: q.exclude, // 배제는 소프트 소비자 없음 — 결정적 값만
    promote: [],
  };
}
