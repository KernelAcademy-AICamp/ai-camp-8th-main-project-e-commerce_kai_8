// Route Handler — 무신사 구조화 검색. LLM 파싱 ∥ lexical 브랜드 매칭 → 하드필터 → 소프트 랭킹.
// ⚠️ 서버 전용. mode 계약(설계 §4.4): 신호 없으면 파서 성공 여부 무관 failed(일반 상위 노출 금지).
import { createClient } from "@supabase/supabase-js";

import type { Goods } from "@/features/catalog/domain/goods";
import {
  type AliasDb,
  getSafeBrandAliases,
} from "@/features/search/data/brand-alias-repository";
import {
  buildGoodsQuery,
  type GoodsQuery,
  type TitleTier,
} from "@/features/search/data/build-goods-query";
import {
  applyColorwayPrefilter,
  COLORWAY_COLUMNS,
  refineColorwayRows,
} from "@/features/search/data/colorway-adapter";
import { interpretSemantic } from "@/features/search/data/interpret-semantic";
import { mapGoodsRow, type SearchGoodsRow } from "@/features/search/data/map-goods-row";
import { parseQueryIntent } from "@/features/search/data/parse-query-intent";
import {
  type LinkerAttempt,
  type LinkerCallStatus,
  linkRelations,
} from "@/features/search/data/relation-linker";
import { adaptSemanticPlan } from "@/features/search/domain/adapt-semantic-plan";
import {
  type AtomicRawAssignment,
  deriveAtomicRawAssignments,
} from "@/features/search/domain/atomic-proposal";
import { mapBaseToProductColors } from "@/features/search/domain/color-family";
import { colorwayPlanToChips } from "@/features/search/domain/colorway-chips";
import type { ColorwayProductRow } from "@/features/search/domain/colorway-evaluate";
import {
  applyColorwayMatches,
  colorwayDisplayColors,
  type ColorwayExecutor,
  colorwayOwnedFilters,
  isColorwayLaneOn,
  prepareColorwayLane,
  productColorOverride,
  runColorwayLane,
} from "@/features/search/domain/colorway-lane";
import {
  type ColorwaySearchPlan,
  isEmptyColorwayPlan,
} from "@/features/search/domain/colorway-plan";
import { compileAtomic } from "@/features/search/domain/compile-atomic";
import {
  compileSemanticPlan,
  type SemanticPrintClause,
} from "@/features/search/domain/compile-semantic-plan";
import {
  decisiveQueryIntent,
  decisiveResponseIntent,
  hasGroundedSignal,
  isDecisiveLaneOn,
} from "@/features/search/domain/decisive-lane";
import { enrichIntent } from "@/features/search/domain/enrich-intent";
import {
  evaluateSemanticPlan,
  simulateSemanticRerank,
} from "@/features/search/domain/execution-bundle";
import { executionEligible } from "@/features/search/domain/execution-eligible";
import { extractExplicitFit } from "@/features/search/domain/extract-explicit-fit";
import { extractExplicitGender } from "@/features/search/domain/extract-explicit-gender";
import { extractExplicitPrice } from "@/features/search/domain/extract-explicit-price";
import { extractExplicitSize } from "@/features/search/domain/extract-explicit-size";
import { extractSoftPreference } from "@/features/search/domain/extract-soft-preference";
import { extractTitleTokens } from "@/features/search/domain/extract-title-tokens";
import { matchBrandDetailed } from "@/features/search/domain/match-brand";
import { pickColorImage } from "@/features/search/domain/pick-color-image";
import { buildQueryFrame } from "@/features/search/domain/query-frame";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { rankGoods } from "@/features/search/domain/rank-goods";
import { resolveIntent } from "@/features/search/domain/resolved-intent";
import {
  hasNonTitleHardFilters,
  hasStyleHardFilters,
  hasWearSignal,
  stripStyleHardFilters,
} from "@/features/search/domain/salvage-intent";
import {
  deriveSearchMode,
  type SearchMode,
} from "@/features/search/domain/search-mode";
import { ownershipPreview } from "@/features/search/domain/semantic-ownership";
import {
  type SemanticExpression,
  validateSemantic,
} from "@/features/search/domain/validate-semantic";

export const maxDuration = 30;

// 결과 상한. 실질 상한은 Supabase PostgREST max_rows(=1000, backend/supabase/config.toml)라
// 이 값을 그 이상으로 올려도 DB 후보가 최대 ~1000건이다(그 이상은 페이지네이션 = Phase 1.5b).
const RESULT_LIMIT = 1000;

const SEARCH_SUMMARY_COLUMNS =
  "goods_no,style_key,title,brand,category,gender,season,color,colors,patterns," +
  "materials,fits,sizes,size_free,size_std,price,review_count,review_score,url,thumbnail,wear_chars,review_tags," +
  "color_images";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function readQuery(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const q = (body as Record<string, unknown>).query;
  return typeof q === "string" ? q.trim() : "";
}

// 요청 단위 LLM off(설계 §8 — 내부 실험용 override). "off" 외 값·부재 = 현행 동작.
function readLlmOff(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  return (body as Record<string, unknown>).llm === "off";
}

// 링커 모델 오버라이드(eval 전용 — 모델 상한 비교). 부재 시 env 모델.
function readLinkerModel(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const m = (body as Record<string, unknown>).linkerModel;
  return typeof m === "string" ? m : undefined;
}

interface SearchPayload {
  results: Goods[];
  intent: QueryIntent;
  mode: SearchMode;
  titleTier: TitleTier | null;
  titleSalvage: boolean;
  titleDropped: boolean;
  /** 서버가 실제 적용한 컬러웨이 해석 칩(설계 §10) — 레인 실행 성공 시에만 채움. */
  colorwayChips?: ReturnType<typeof colorwayPlanToChips>;
  /** LLM 의미 해석 shadow(설계 §8.2) — 검증 통과분만, 검색 결과에는 미반영. */
  semanticShadow?: {
    expressions: SemanticExpression[];
    modelId: string;
    latencyMs: number;
    /** true = 소프트 랭킹에 반영됨(§8.3 최소 on). false = 관측만(§8.2 shadow). */
    applied: boolean;
  };
  /** 시맨틱 링커 Shadow1(설계 §6) — 후보 plan·호출 상태 관측만, 검색 결과 미반영. */
  semanticLinkerShadow?: {
    /**
     * 링커 호출의 terminal status — no_proposal 뭉개기 없이 원인을 분해한다.
     * 호출단계(no_key/no_mentions/http_error/timeout/empty_content/json_error/schema_error)
     * + 검증단계(valid_graph=통과 / validation_error=파싱됐으나 검증 거부).
     */
    status:
      | Exclude<LinkerCallStatus, "parsed">
      | "valid_graph"
      | "valid_abstain"
      | "validation_error"
      | "unsupported_capability";
    modelId: string;
    promptVersion: string;
    latencyMs: number;
    /** 진단용 — 스키마 검증 전 원문/JSON(shadow 전용). */
    rawText?: string;
    rawJson?: unknown;
    /** 파싱된 경우: 검증 성패와 무관한 색/그래픽별 target 귀속(base/print 역전 측정용). */
    rawAssignments?: AtomicRawAssignment[];
    /** validation_error·unsupported일 때 원인 코드(무손실 진단). */
    compileErrors?: string[];
    /** grounding 품질 경고(valid_graph_with_warnings) — targetAnchorRef 누락·환각. */
    warnings?: string[];
    unknownAnchorRefs?: string[];
    // 아래는 valid_graph일 때만 존재(검증 통과 후 컴파일 결과).
    printClauses?: SemanticPrintClause[];
    coverage?: number;
    ownership?: { claimedSpans: [number, number][]; suppressedFlatAxes: string[] };
    external?: { surface: string; span: [number, number] }[];
    graphHash?: string;
    /** Shadow2 — 실행자격·DB 실평가·rerank 시뮬레이션 관측(응답 결과엔 미반영). */
    shadow2?: {
      /** 적용 권한: off(관측만)/mark(순서불변+표식)/rerank(On1a 재정렬 커밋). */
      applyMode: "off" | "mark" | "rerank";
      eligible: boolean;
      eligibleReason?: string;
      adapterFailed?: boolean;
      adaptedPlanKey?: string;
      eval?: {
        status: "success" | "failure";
        /** DB 카탈로그 전체 match 수(결과 집합 밖 포함). */
        matchCount?: number;
        truncated?: boolean;
        failureReason?: string;
        latencyMs: number;
      };
      /** OFF 결과 집합 안에서의 match 수(실제 rerank 영향) + 상위 K 내 수. */
      rerank?: { matchedResultCount: number; matchedInTopK: number };
      /** rerank 모드에서 실제 결과 순서가 커밋됐는지. */
      committed?: boolean;
    };
  };
}

function failed(
  intent: QueryIntent,
  semanticShadow?: SearchPayload["semanticShadow"],
): Response {
  return Response.json({
    results: [],
    intent,
    mode: "failed",
    titleTier: null,
    titleSalvage: false,
    titleDropped: false,
    ...(semanticShadow ? { semanticShadow } : {}),
  } satisfies SearchPayload);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const query = readQuery(body);
  if (!query) return failed(EMPTY_INTENT);
  if (!SUPABASE_URL || !SUPABASE_KEY) return failed(EMPTY_INTENT);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const llmOff = readLlmOff(body);

  // 0) 의미 해석(설계 §8) — env로 제어. shadow=관측만 / on=검증 통과분을 소프트로만 병합.
  //    실패는 해석 없음(§8.4). 본 검색과 병렬 실행.
  const llmSemanticMode = process.env.SEARCH_LLM_MODE;
  // atomic 링커 적용 권한(SEARCH_LLM_MODE와 분리, On1a). off=Shadow2 관측만 / mark=순서
  //   불변+표식 / rerank=stable rerank. llm=off 요청이면 모든 적용을 끈다(행동 kill switch).
  const rawApplyMode = process.env.SEARCH_LINKER_APPLY_MODE;
  const linkerApplyMode: "off" | "mark" | "rerank" = llmOff
    ? "off"
    : rawApplyMode === "rerank"
      ? "rerank"
      : rawApplyMode === "mark"
        ? "mark"
        : "off";
  // 요청 llm=off는 §12 계약상 모든 LLM 경로를 끈다(의미 해석·관계 링커 포함).
  const semanticActive =
    (llmSemanticMode === "shadow" || llmSemanticMode === "on") && !llmOff;
  //    interpretSemantic은 실패를 null로 돌려주지만, 어떤 예외도 검색을 죽이지 않도록 한 번 더 방어.
  const semanticPromise = semanticActive
    ? interpretSemantic(query).catch((): null => null)
    : Promise.resolve(null);

  // 0b) 시맨틱 링커 Shadow1(§6) — mention 추출 후 관계 링커를 병렬 실행. 결과 미반영·응답 OFF 동일.
  const linkerActive =
    (llmSemanticMode === "shadow" || llmSemanticMode === "on") && !llmOff;
  const linkerFrame = linkerActive ? buildQueryFrame(query) : null;
  const linkerModel = readLinkerModel(body);
  // linkRelations는 no_mentions·실패를 status로 자체 보존한다(null 반환 안 함). 예외만 방어.
  const linkerPromise: Promise<LinkerAttempt | null> = linkerFrame
    ? linkRelations(linkerFrame, fetch, linkerModel).catch((): null => null)
    : Promise.resolve(null);

  // 1) LLM 파싱(semantic 레인) — 계약 불변. llm=off면 호출 자체를 생략하고
  //    결정적 경로(가격·브랜드·제목·컬러웨이)만 사용한다(로고 토글 스펙).
  const { intent: parsedIntent, degraded: parserDegraded } = llmOff
    ? { intent: EMPTY_INTENT, degraded: true }
    : await parseQueryIntent(query);

  // 1b) 결정적 가격 파서(설계 P0-①) — 통화 단위가 명시된 가격 표현이 있으면 LLM의
  //     priceMin/Max 환각(예: "2만원 이하"→2000원으로 오파싱)을 결정적 결과로 전량 대체한다.
  //     미발견 시 LLM 값 유지.
  const explicitPrice = extractExplicitPrice(query);
  let intent = parsedIntent;
  if (explicitPrice) {
    intent = {
      ...intent,
      priceMin: explicitPrice.priceMin,
      priceMax: explicitPrice.priceMax,
    };
  }

  // 1b-2) 결정적 사이즈 파서 — llm=off 전용(LLM 경로의 사이즈 파싱은 계약 불변).
  //       "사이즈 95"·"95 입는"처럼 보수적 패턴만. 소비 표현은 제목 토큰에서 제외한다.
  const explicitSize = llmOff ? extractExplicitSize(query) : null;
  if (explicitSize) {
    intent = {
      ...intent,
      sizeStd: [...new Set([...intent.sizeStd, ...explicitSize.sizeStd])],
    };
  }
  const explicitGender = llmOff ? extractExplicitGender(query) : null;
  if (explicitGender) intent = { ...intent, gender: explicitGender.gender };
  const explicitFit = llmOff ? extractExplicitFit(query) : null;
  if (explicitFit) {
    intent = {
      ...intent,
      style: {
        ...intent.style,
        fits: [...new Set([...intent.style.fits, ...explicitFit.fits])],
      },
    };
  }

  // 결정적 정책 보강(설계 §7 승격) — 색 유사어·계열색·패턴/소재 유사어·주관어·장소→계절·
  // 활동→리뷰태그를 LLM 결과 위에 결정적으로 덮어 모델 재량 변동을 제거한다(모든 모드).
  intent = enrichIntent(query, intent).intent;

  const decisive = isDecisiveLaneOn(process.env);

  // 1c) 컬러웨이 결속 레인(기본 꺼짐, 결정 기록 D3) — 꺼짐이면 해석·실행 일절 미호출.
  //     계획이 비면 null → 기존 경로 그대로. 소비 표현은 제목 토큰에서 제외(D4).
  //     llm=off 요청은 결정적 검색 데모이므로 레인을 요청 단위로 활성화한다.
  const colorwayLane =
    isColorwayLaneOn(process.env) || llmOff ? prepareColorwayLane(query) : null;

  // 1d) 바탕색 단독 계획은 기존 colors 필드로 이관(결정 기록 D7 — base_colors 당분간 미사용).
  //     결속 파이프라인 대신 기존 하드필터·랭킹을 그대로 타서 전 카탈로그를 커버한다.
  const colorOverride = colorwayLane ? productColorOverride(colorwayLane) : null;
  if (colorOverride) {
    intent = {
      ...intent,
      style: {
        ...intent.style,
        colors: [...new Set([...intent.style.colors, ...colorOverride.colors])],
      },
      exclude: {
        ...intent.exclude,
        colors: [
          ...new Set([...intent.exclude.colors, ...colorOverride.excludeColors]),
        ],
      },
    };
  }

  // 1e) D4 조건 소유권 확장 — 결속(프린트) 계획이 소유한 색·'프린트' 패턴을 LLM 평면
  //     하드필터에서 제거한다. 안 그러면 "블랙 프린팅"이 평면 colors=[블랙](바탕·프린트
  //     혼동)으로도 걸려 이중 필터 충돌·오염이 난다. 결속은 컬러웨이 레인이 전담한다.
  const owned = colorwayLane ? colorwayOwnedFilters(colorwayLane) : null;
  if (owned) {
    const ownedSet = new Set(owned.colors);
    intent = {
      ...intent,
      style: {
        ...intent.style,
        colors: intent.style.colors.filter((c) => !ownedSet.has(c)),
        // 명시적 패턴어가 없으면 LLM이 '프린팅'에서 과추론한 평면 패턴을 전부 제거(변동 제거).
        patterns: owned.stripAllPatterns ? [] : intent.style.patterns,
      },
    };
  }

  // 2) lexical 브랜드 레이어 — safe alias만 로드하므로 매칭 성공 = safe(불변식).
  //    사전 조회 실패 → failed(설계 §4.4). flag-on이면 오류 경로도 resolved 응답 계약 준수.
  try {
    // supabase-js 클라이언트는 AliasDb를 구조적으로 만족(제네릭 차이만 캐스트로 흡수).
    // eslint 타입체커는 단일 캐스트를 불필요하다고 보지만, tsc --noEmit은 단일 캐스트에서
    // TS2589(과도한 타입 인스턴스화)로 실패한다. `as unknown as`로 우회.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const aliases = await getSafeBrandAliases(supabase as unknown as AliasDb);
    const brandMatch = matchBrandDetailed(query, aliases);
    if (brandMatch) intent = { ...intent, brand: brandMatch.brand };
    const titleTokens = extractTitleTokens(query, [
      ...(brandMatch?.consumedTokens ?? []),
      ...(colorwayLane?.consumedTokens ?? []),
      ...(explicitSize?.consumedTokens ?? []),
      ...(explicitGender?.consumedTokens ?? []),
      ...(explicitFit?.consumedTokens ?? []),
    ]);
    if (titleTokens.length) intent = { ...intent, titleTokens };
  } catch {
    return failed(
      decisive
        ? decisiveResponseIntent(
            resolveIntent({ intent, explicitPrice: explicitPrice !== null }),
          )
        : intent,
    );
  }

  // 2b) provenance 해석(P3-F) — 값 단위 출처 메타. flag-off에선 관측 준비일 뿐 동작 불변.
  const resolved = resolveIntent({ intent, explicitPrice: explicitPrice !== null });
  // flag-on 전용: 응답은 resolved 계약(미적용 LLM 값 제거), 조회는 하드 정책 적용.
  let responseIntent = decisive ? decisiveResponseIntent(resolved) : intent;
  if (decisive) intent = decisiveQueryIntent(resolved);
  const respIntent = (): QueryIntent => (decisive ? responseIntent : intent);
  // flag-off 랭킹은 조회 intent 그대로(현행과 참조 동일) / flag-on은 소프트 강등분을
  // 반영하기 위해 responseIntent(색 등 유지)로 랭킹한다.
  const rankIntentOf = (forIntent: QueryIntent): QueryIntent => {
    const base = decisive ? responseIntent : forIntent;
    if (!semanticApplied) return base;
    // ON 소프트 병합: 랭킹에서만 색 선호 — 조회 하드필터에는 넣지 않는다.
    return {
      ...base,
      style: {
        ...base.style,
        colors: [...new Set([...base.style.colors, ...semanticRankColors])],
      },
    };
  };

  // 2c) ON 모드(§8.3 최소): 검증 통과한 의미 해석 중 옷 바탕색 후보를 "소프트 랭킹 선호"로만
  //     병합한다. 하드필터 금지(§7 — LLM 해석은 기본 should), 결정적 색 조건이 있으면 양보(결정적 우선).
  let semanticApplied = false;
  let semanticRankColors: string[] = [];
  // 승격된 결정적 소프트 선호(§7) — 유행류 표현. LLM 여부와 무관하게 항상 결정적으로 적용.
  const softPref =
    intent.style.colors.length === 0 ? extractSoftPreference(query) : null;
  if (softPref) {
    semanticRankColors = [...softPref.colors];
    semanticApplied = true;
  }
  // atomic apply(mark/rerank)가 켜지면 기존 LLM interpretSemantic 색 병합은 끈다(이중 소유
  //   방지, codex). 결정적 softPref는 그대로 유지 — atomic 때문에 결정적 승격을 끄면 안 됨.
  let semanticEarly: Awaited<typeof semanticPromise> = null;
  if (llmSemanticMode === "on" && linkerApplyMode === "off") {
    semanticEarly = await semanticPromise;
    if (semanticEarly) {
      const validated = validateSemantic(semanticEarly.raw, query);
      const noDeterministicColor =
        intent.style.colors.length === 0 &&
        (!colorwayLane || isEmptyColorwayPlan(colorwayLane.plan));
      if (noDeterministicColor) {
        const llmColors = validated.expressions
          .filter(
            (e) =>
              e.target === "garment_base" &&
              (e.resolution === "semantic" || e.resolution === "family"),
          )
          .flatMap((e) => e.candidates);
        semanticRankColors = [...new Set([...semanticRankColors, ...llmColors])];
        semanticApplied = semanticRankColors.length > 0;
      }
    }
  }

  // 3) mode 판정 — 신호 없으면 DB 조회 없이 failed(일반 상위 상품 노출 금지).
  //    flag-on: grounded 신호(결정적 출처 ≥1)만 신호로 인정(설계 §3.5, v2.1 명문화 ②).
  let mode: SearchMode = decisive
    ? hasGroundedSignal(resolved)
      ? parserDegraded
        ? "lexical_only"
        : "full"
      : "failed"
    : deriveSearchMode(parserDegraded, intent);
  // 컬러웨이 결속 "조건"이 있는 계획만 검색 신호다(빈 계획 lane은 소비 span 전달용).
  if (mode === "failed" && colorwayLane && !isEmptyColorwayPlan(colorwayLane.plan))
    mode = "lexical_only";
  if (mode === "failed" && semanticApplied) mode = "lexical_only";
  if (mode === "failed") {
    // on 모드에서 이미 받은 해석은 failed여도 관측 가능하게 동봉한다.
    let failedShadow: SearchPayload["semanticShadow"];
    if (semanticEarly) {
      const v = validateSemantic(semanticEarly.raw, query);
      if (v.expressions.length > 0)
        failedShadow = {
          expressions: v.expressions,
          modelId: semanticEarly.meta.modelId,
          latencyMs: semanticEarly.meta.latencyMs,
          applied: false,
        };
    }
    return failed(respIntent(), failedShadow);
  }

  // 4) 하드 필터 쿼리(브랜드 eq 포함) → 후보 페치 → 소프트 랭킹.
  //    제목 잔여 토큰이 있으면 phrase→and→or tier 순으로 폴백(설계 §9-2).
  const TITLE_TARGET = 24; // 다른 하드필터 적용 후 고유 상품 24개면 폴백 중단
  const TIERS: TitleTier[] = ["phrase", "and", "or"];

  // 4a) 컬러웨이 결속 실행을 본 쿼리보다 먼저 — 일치 goods_no를 본 쿼리 IN 필터로
  //     내려 후보 1000행 상한에 의한 누락을 막는다(교집합만으로는 후보 밖 상품을 놓친다).
  //     실행 실패는 필터 미적용 폴백(설계 §8.4).
  // 컬러웨이 사전필터 후보를 페이지로 전부 수집한다. 바탕색이 매핑 재판정(D8)으로
  // 미뤄져 사전필터 후보가 라벨 전량에 근접할 수 있는데, PostgREST max_rows(1000) 상한을
  // 한 번에 받으면 뒤쪽 후보의 참 일치를 조용히 놓친다 — 반드시 소진할 때까지 페이징.
  const COLORWAY_PAGE = 1000;
  const fetchColorwayCandidates = async (
    plan: ColorwaySearchPlan,
  ): Promise<ColorwayProductRow[]> => {
    const rows: ColorwayProductRow[] = [];
    for (let from = 0; ; from += COLORWAY_PAGE) {
      const base = supabase
        .from("search_goods")
        .select(`goods_no,${COLORWAY_COLUMNS}`)
        .range(from, from + COLORWAY_PAGE - 1);
      const { data, error } = await applyColorwayPrefilter(base, plan);
      if (error) throw new Error(error.message);
      const batch = data as unknown as ColorwayProductRow[];
      rows.push(...batch);
      if (batch.length < COLORWAY_PAGE) break;
    }
    return rows;
  };

  let colorwayMatched: Set<number> | null = null;
  if (colorwayLane && colorwayLane.plan.printClauses.length > 0) {
    const executor: ColorwayExecutor = async (plan) => {
      const rows = await fetchColorwayCandidates(plan);
      return new Set(refineColorwayRows(rows, plan).map((r) => r.goods_no));
    };
    colorwayMatched = await runColorwayLane(executor, colorwayLane);
  }
  // IN 필터로 내릴 수 있는 상한 — URL 길이 제약. 초과 시 사후 교집합만 사용(현재 라벨
  // 규모에서는 도달 불가, 대량 라벨 후 재검토 항목은 followup 문서 참조).
  const COLORWAY_IN_LIMIT = 800;
  const colorwayInIds =
    colorwayMatched && colorwayMatched.size <= COLORWAY_IN_LIMIT
      ? [...colorwayMatched]
      : null;

  const fetchTier = async (forIntent: QueryIntent, tier?: TitleTier) => {
    let builder = supabase.from("search_goods").select(SEARCH_SUMMARY_COLUMNS);
    if (colorwayInIds) builder = builder.in("goods_no", colorwayInIds);
    const base = builder as unknown as GoodsQuery;
    return await (buildGoodsQuery(base, forIntent, tier) as unknown as PromiseLike<{
      data: SearchGoodsRow[] | null;
      error: unknown;
    }>);
  };

  // 제목 tier 폴백 — 상위 tier 우선 배치, goods_no dedup, 24개 채우면 중단.
  // 재사용: 원본 intent와 제목 0건 구제(salvage) intent 양쪽 스윕에 쓴다(설계 §4.4).
  const sweepTitleTiers = async (
    forIntent: QueryIntent,
  ): Promise<{
    results: Goods[];
    titleTier: TitleTier | null;
    uniqueCount: number;
  } | null> => {
    const seen = new Set<string>();
    const groups: Goods[][] = [];
    let titleTier: TitleTier | null = null;
    for (const tier of TIERS) {
      const { data, error } = await fetchTier(forIntent, tier);
      if (error || !data) return null;
      titleTier = tier;
      const fresh = data.map(mapGoodsRow).filter((g) => {
        if (seen.has(g.goodsNo)) return false;
        seen.add(g.goodsNo);
        return true;
      });
      if (fresh.length)
        groups.push(rankGoods(fresh, rankIntentOf(forIntent), RESULT_LIMIT));
      if (seen.size >= TITLE_TARGET) break;
    }
    return {
      results: groups.flat().slice(0, RESULT_LIMIT),
      titleTier,
      uniqueCount: seen.size,
    };
  };

  let results: Goods[];
  let titleTier: TitleTier | null = null;
  let titleSalvage = false;
  let titleDropped = false;

  if (intent.titleTokens?.length) {
    const sweep = await sweepTitleTiers(intent);
    if (!sweep) return failed(respIntent());
    results = sweep.results;
    titleTier = sweep.titleTier;
    let uniqueCount = sweep.uniqueCount;

    // 제목 0건 구제(v3.2, 사용자 승인) — 전 tier 0건 && LLM 유래 스타일 하드필터/exclude
    // 존재 시, 그걸 뺀 intent로 1회만 재스윕. 성공하면 결과·intent를 교체(칩 반영).
    if (uniqueCount === 0 && hasStyleHardFilters(intent)) {
      titleSalvage = true;
      const salvageIntent = stripStyleHardFilters(intent);
      const salvageSweep = await sweepTitleTiers(salvageIntent);
      if (!salvageSweep) return failed(respIntent());
      uniqueCount = salvageSweep.uniqueCount;
      if (salvageSweep.uniqueCount > 0) {
        results = salvageSweep.results;
        titleTier = salvageSweep.titleTier;
        intent = salvageIntent;
      }
    }

    // titleTokens 폐기 fallback(P0-②) — strict 스윕·style-strip 구제가 둘 다 0건이면
    // 제목 하드 게이트가 대화 필러를 오탐(예: "내가 105 입는데…")했을 가능성이 있다.
    // 다른 비제목 하드 조건이 실제로 남아있을 때만(hasNonTitleHardFilters), 제목 토큰을
    // 통째로 뺀 원본 intent로 Phase 1 단일 쿼리(tier 없음) 1회 재시도한다.
    // 착용감 소프트 신호도 폐기 재시도 가치가 있다(mode 판정과 동일 기준 — "바캉스" 케이스).
    if (
      uniqueCount === 0 &&
      (hasNonTitleHardFilters(intent) || hasWearSignal(intent))
    ) {
      const intentNoTitle: QueryIntent = { ...intent, titleTokens: [] };
      const { data, error } = await fetchTier(intentNoTitle);
      if (error || !data) return failed(respIntent());
      // 폐기된 titleTokens는 랭킹에도 무영향이어야 한다 — flag-on 랭킹 intent에서도 제거.
      const dropRankIntent = decisive
        ? { ...responseIntent, titleTokens: [] }
        : intentNoTitle;
      const dropped = rankGoods(data.map(mapGoodsRow), dropRankIntent, RESULT_LIMIT);
      if (dropped.length > 0) {
        results = dropped;
        titleTier = null;
        intent = intentNoTitle;
        if (decisive) responseIntent = { ...responseIntent, titleTokens: [] };
        titleDropped = true;
      }
    }
  } else {
    const { data, error } = await fetchTier(intent);
    if (error || !data) return failed(respIntent());
    results = rankGoods(data.map(mapGoodsRow), rankIntentOf(intent), RESULT_LIMIT);
  }

  // 4b) 컬러웨이 결속 사후 교집합 — IN 필터를 못 내린 경우(상한 초과)의 안전망이며,
  //     IN 필터가 적용됐다면 무손실 no-op이다. 실행 실패(matched=null)면 미적용 폴백.
  results = applyColorwayMatches(results, colorwayMatched);

  // 표시 이미지 선택(조언 층) — 검색 의도 색으로 색별 이미지를 고른다.
  //   · results 순서·랭킹·mode엔 영향 없음(순수 후처리).
  //   · 색별 이미지 맵(colorImages)은 응답에서 제거하고 고른 1장(displayImage)만 내려보낸다.
  const finalIntent = respIntent();
  // 결속 계획이 소유해 intent에서 빠진 바탕색도 사진 선택엔 넘긴다(레인 색 우선).
  // 계획의 캐논 색은 상품 colors(판매자 표기)로 계열 스냅해서 넘긴다 — 판정은 차콜↔다크 그레이를
  // 같은 계열로 묶어 잡는데 사진 인덱스 키는 판매자 표기라, 캐논 그대로면 계열로 걸린 상품은
  // 전부 교체에 실패한다(D8: 색 값의 진실은 상품 colors).
  const laneDisplay = colorwayLane ? colorwayDisplayColors(colorwayLane) : null;
  const snapToSeller = (canon: string[], productColors: string[]): string[] =>
    productColors.length > 0 ? mapBaseToProductColors(canon, productColors) : canon;
  const withDisplay: Goods[] = results.map((g) => {
    const displayImage =
      pickColorImage(
        g.colorImages,
        [
          ...new Set([
            ...snapToSeller(laneDisplay?.colors ?? [], g.colors),
            ...finalIntent.style.colors,
          ]),
        ],
        [
          ...new Set([
            ...snapToSeller(laneDisplay?.excludeColors ?? [], g.colors),
            ...finalIntent.exclude.colors,
          ]),
        ],
      ) ?? undefined;
    return { ...g, colorImages: undefined, displayImage };
  });

  // 의미 해석 응답 필드 — on은 앞에서 await한 결과 재사용, shadow는 여기서 대기(지연 숨김).
  let semanticShadow: SearchPayload["semanticShadow"];
  const semantic = llmSemanticMode === "on" ? semanticEarly : await semanticPromise;
  if (semantic) {
    const validated = validateSemantic(semantic.raw, query);
    if (validated.expressions.length > 0) {
      semanticShadow = {
        expressions: validated.expressions,
        modelId: semantic.meta.modelId,
        latencyMs: semantic.meta.latencyMs,
        applied: semanticApplied,
      };
    }
  }

  // 시맨틱 링커 Shadow1(§6) 응답 필드 — 후보 plan을 관측만 한다(결과·intent 무영향).
  let semanticLinkerShadow: SearchPayload["semanticLinkerShadow"];
  // On1a 커밋 후보(rerank 모드+성공 시에만 채워짐). 실패·부적격·off/mark면 null → withDisplay.
  let on1Reranked: Goods[] | null = null;
  const attempt = await linkerPromise;
  if (linkerFrame && attempt) {
    try {
      const base = {
        modelId: attempt.meta.modelId,
        promptVersion: attempt.meta.promptVersion,
        latencyMs: attempt.meta.latencyMs,
        rawText: attempt.rawText,
        rawJson: attempt.rawJson,
      };
      if (attempt.status === "parsed" && attempt.proposal) {
        // 파싱된 제안의 raw 귀속은 검증 성패와 무관하게 관측한다(부분 관측 허용).
        const rawAssignments = deriveAtomicRawAssignments(
          linkerFrame,
          attempt.proposal,
        );
        const compiled = compileAtomic(linkerFrame, attempt.proposal);
        if (compiled.disposition === "valid_graph" && compiled.graph) {
          const plan = compileSemanticPlan(compiled.graph);
          // Shadow2 — 실행자격 판정 → 어댑터 → DB 실평가 → rerank 시뮬레이션(관측만, 본 조회 미주입).
          const elig = executionEligible(compiled.graph, plan);
          let shadow2: NonNullable<SearchPayload["semanticLinkerShadow"]>["shadow2"];
          if (!elig.eligible) {
            shadow2 = {
              applyMode: linkerApplyMode,
              eligible: false,
              eligibleReason: elig.reason,
            };
          } else {
            const adapted = adaptSemanticPlan(plan.printClauses);
            if (!adapted) {
              shadow2 = {
                applyMode: linkerApplyMode,
                eligible: true,
                adapterFailed: true,
              };
            } else {
              // 결정적 컬러웨이 executor와 동일 로직이지만 완전 별도(본 조회에 IN 미주입).
              const semanticExecutor: ColorwayExecutor = async (p) => {
                const rows = await fetchColorwayCandidates(p);
                return new Set(refineColorwayRows(rows, p).map((r) => r.goods_no));
              };
              const evaluation = await evaluateSemanticPlan(adapted, semanticExecutor);
              const rerank =
                evaluation.status === "success"
                  ? simulateSemanticRerank(withDisplay, evaluation.matchedIds)
                  : undefined;
              // On1a: rerank 모드일 때만 재정렬 결과를 커밋 후보로 잡는다(응답 최종에 한 번만
              //   선택, withDisplay는 mutate 안 함). off/mark는 관측만.
              if (linkerApplyMode === "rerank" && rerank) on1Reranked = rerank.reranked;
              shadow2 = {
                applyMode: linkerApplyMode,
                eligible: true,
                adaptedPlanKey: adapted.planKey,
                committed: linkerApplyMode === "rerank" && rerank !== undefined,
                eval:
                  evaluation.status === "success"
                    ? {
                        status: "success",
                        matchCount: evaluation.matchedIds.size,
                        truncated: evaluation.truncated,
                        latencyMs: evaluation.latencyMs,
                      }
                    : {
                        status: "failure",
                        failureReason: evaluation.reason,
                        latencyMs: evaluation.latencyMs,
                      },
                ...(rerank
                  ? {
                      rerank: {
                        matchedResultCount: rerank.matchedCount,
                        matchedInTopK: rerank.matchedInTopK,
                      },
                    }
                  : {}),
              };
            }
          }
          semanticLinkerShadow = {
            ...base,
            status: "valid_graph",
            rawAssignments,
            printClauses: plan.printClauses,
            coverage: plan.coverage,
            ownership: ownershipPreview(linkerFrame, compiled.graph),
            external: compiled.graph.external,
            graphHash: compiled.graph.graphHash,
            shadow2,
            ...(compiled.warnings
              ? {
                  warnings: compiled.warnings,
                  unknownAnchorRefs: compiled.unknownAnchorRefs,
                }
              : {}),
          };
        } else if (compiled.disposition === "valid_abstain") {
          // unresolved 포함 — 완전한 의미적 abstain(실행 부적격, 관측만).
          semanticLinkerShadow = { ...base, status: "valid_abstain", rawAssignments };
        } else if (compiled.disposition === "unsupported_capability") {
          // 결정적 분석이 Shadow1 범위 밖으로 판정(부정 등) — 안전거부. 실행 불가.
          semanticLinkerShadow = {
            ...base,
            status: "unsupported_capability",
            rawAssignments,
            compileErrors: compiled.errors,
          };
        } else {
          // 파싱은 됐으나 검증 거부 — 의미 오류(역전·누락·환각)를 관측만(실행 미반영).
          semanticLinkerShadow = {
            ...base,
            status: "validation_error",
            rawAssignments,
            compileErrors: compiled.errors,
          };
        }
      } else if (attempt.status !== "parsed") {
        // 호출단계 실패 — no_proposal을 원인별 status로 보존(평가 histogram용).
        semanticLinkerShadow = { ...base, status: attempt.status };
      }
    } catch {
      semanticLinkerShadow = undefined;
    }
  }

  // On1a 커밋: rerank 모드+성공이면 재정렬 결과만, 그 외엔 OFF(withDisplay). 여기서 한 번만
  //   선택하고 다른 응답 필드(intent·mode·titleTier·chips)는 OFF 그대로(멤버십·개수 불변).
  const committedResults =
    linkerApplyMode === "rerank" && on1Reranked ? on1Reranked : withDisplay;

  return Response.json({
    results: committedResults,
    intent: finalIntent,
    mode,
    titleTier,
    titleSalvage,
    titleDropped,
    ...(semanticShadow ? { semanticShadow } : {}),
    ...(semanticLinkerShadow ? { semanticLinkerShadow } : {}),
    // 적용된 해석만 칩으로: 결속 실행 성공(matched) 또는 기존 색 필터 이관(override).
    ...(colorwayLane && (colorwayMatched !== null || colorOverride)
      ? { colorwayChips: colorwayPlanToChips(colorwayLane.plan) }
      : {}),
  } satisfies SearchPayload);
}
