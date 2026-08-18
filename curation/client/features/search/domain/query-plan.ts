// 조회 계획(설계 §3.5 QueryPlan) — 후보 하드 계획(후보 집합을 결정하는 모든 것, 해시 대상)과
// 전체 실행 계획(소프트 주석·사용자 정렬, 기준선 기록용)의 이원 구조.
// 후보 파생은 라우트가 실제 조회에 쓰는 것과 같은 함수(decisiveQueryIntent)를 경유한다 —
// 게이트가 해시하는 계획과 실제 조회의 표류를 구조적으로 차단(값 단위 provenance가 단일 근거).
// PostgREST 직렬화(candidateCalls)는 데이터 계층(data/candidate-calls.ts)에 있다.
import { decisiveQueryIntent } from "@/features/search/domain/decisive-lane";
import {
  type QueryIntent,
  type SortIntent,
  WEAR_AXES,
  type WearCharsFilter,
} from "@/features/search/domain/query-intent";
import type { ResolvedIntent } from "@/features/search/domain/resolved-intent";

const STYLE_AXES = ["colors", "patterns", "materials", "fits"] as const;
type StyleAxis = (typeof STYLE_AXES)[number];
type StyleAxes = Record<StyleAxis, string[]>;

// 고정 후보-fetch 정렬·상한 — 의도와 무관한 상수(후보 집합을 결정하므로 후보 계획에 포함).
const FETCH_ORDER = [
  ["review_score", false],
  ["goods_no", true],
] as const;
const FETCH_LIMIT = 3000;

export interface CandidateHardPlan {
  brand: string | null;
  titleTokens: string[];
  gender: string | null;
  sizeStd: number[];
  priceMin: number | null;
  priceMax: number | null;
  hardStyle: StyleAxes;
  excludeStyle: StyleAxes;
  excludeTitle: string[]; // exclude.keywords → 제목 NOT(하드)
  fetchOrder: typeof FETCH_ORDER;
  limit: typeof FETCH_LIMIT;
}

export interface ExecutionPlan {
  candidate: CandidateHardPlan;
  soft: {
    keywords: string[];
    wearChars: WearCharsFilter;
    // flag-on에서 하드→소프트로 강등된 LLM 스타일(랭킹 소비자 존재 축만).
    degradedStyle?: StyleAxes;
  };
  userSort: SortIntent; // LLM 유래 사용자 정렬 — 후보 집합 무관(해시 비대상)
}

// 조회에 실제 적용될 intent — 라우트와 계획이 공유하는 단일 파생점.
export function effectiveQueryIntent(
  resolved: ResolvedIntent,
  decisive: boolean,
): QueryIntent {
  return decisive ? decisiveQueryIntent(resolved) : resolved.intent;
}

export function buildQueryPlan(
  resolved: ResolvedIntent,
  { decisive }: { decisive: boolean },
): ExecutionPlan {
  const { intent } = resolved;
  const qi = effectiveQueryIntent(resolved, decisive);

  const candidate: CandidateHardPlan = {
    brand: qi.brand ?? null,
    titleTokens: qi.titleTokens ?? [],
    gender: qi.gender ?? null,
    sizeStd: qi.sizeStd,
    priceMin: qi.priceMin ?? null,
    priceMax: qi.priceMax ?? null,
    hardStyle: {
      colors: qi.style.colors,
      patterns: qi.style.patterns,
      materials: qi.style.materials,
      fits: qi.style.fits,
    },
    excludeStyle: {
      colors: qi.exclude.colors,
      patterns: qi.exclude.patterns,
      materials: qi.exclude.materials,
      fits: qi.exclude.fits,
    },
    excludeTitle: qi.exclude.keywords,
    fetchOrder: FETCH_ORDER,
    limit: FETCH_LIMIT,
  };

  // 강등분 = 원본 스타일 중 조회 intent에 하드로 남지 않은 값(= LLM 출처).
  const degraded: StyleAxes = {
    colors: intent.style.colors.filter((v) => !qi.style.colors.includes(v)),
    patterns: intent.style.patterns.filter((v) => !qi.style.patterns.includes(v)),
    materials: intent.style.materials.filter((v) => !qi.style.materials.includes(v)),
    fits: intent.style.fits.filter((v) => !qi.style.fits.includes(v)),
  };
  const hasDegraded = STYLE_AXES.some((a) => degraded[a].length > 0);

  return {
    candidate,
    soft: {
      keywords: intent.style.keywords,
      wearChars: WEAR_AXES.reduce<WearCharsFilter>(
        (acc, axis) => ({ ...acc, [axis]: intent.wearChars[axis] }),
        {} as WearCharsFilter,
      ),
      ...(decisive && hasDegraded ? { degradedStyle: degraded } : {}),
    },
    userSort: intent.sort,
  };
}

// 결정성 키(candidatePlanKey)는 직렬화 계층인 data/candidate-calls.ts에 있다 —
// 전 tier 호출열을 포함해야 하므로 PostgREST 직렬화와 같은 곳에 둔다(계층 정합).
