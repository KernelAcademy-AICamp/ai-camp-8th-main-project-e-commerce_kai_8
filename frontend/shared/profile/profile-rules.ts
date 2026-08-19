// 취향 프로필 순수 규칙 (설계 §6) — 저장·시계·세션 판정은 호출부가 주입한다.
// bounded summary 원칙: 원시 이벤트를 쌓지 않고 앵커 가중치와 상한 있는
// 보조 상태(노출 횟수·최근 노출)만 유지한다.

/** 프로필 스키마 버전 — 구조를 바꾸면 올린다 */
export const PROFILE_SCHEMA_VERSION = 2;

/** 앵커 상한 (설계 §6 초기값) */
export const LONG_ANCHOR_MAX = 50;
export const SESSION_ANCHOR_MAX = 20;

/** 세션 하나가 지날 때마다 장기 앵커 가중치에 곱하는 감쇠 */
export const DECAY_PER_SESSION = 0.9;

/** 신호 가중 서열 (PRD): 반복 탐색 < 스타일 탐색 < 찜 < 판매처 이동 */
export const SIGNAL_WEIGHTS = {
  tap: 1,
  style_explore: 2,
  wish: 4,
  outbound: 6,
} as const;

/** 자기강화 방지: 행동 가중 = 기본 가중 / (1 + 이 상품 노출 수 × 이 계수) */
export const IMPRESSION_DAMPING = 0.3;

/** 최근 노출 목록 상한 (중복 제거 요청용, 설계 §7) */
export const RECENT_IMPRESSIONS_MAX = 600;

/** 상품별 노출 횟수 맵 상한 — 초과 시 횟수 낮은 것부터 버린다 */
export const IMPRESSION_COUNT_MAX = 600;

/** `이 스타일로 계속 탐색` 직후 세션 슬롯을 부스트하는 실제 노출 수 (설계 §7) */
export const STYLE_BOOST_IMPRESSIONS = 60;

export type ProfileActionType = keyof typeof SIGNAL_WEIGHTS | "unwish";

/** 앵커 성별 — 성별 미상은 필드 자체를 두지 않는다(undefined) */
export type AnchorGender = "남성" | "여성" | "공용";

export interface Anchor {
  goodsNo: number;
  weight: number;
  lastMs: number;
  gender?: AnchorGender;
}

export interface SessionProfile {
  sessionId: string;
  anchors: Anchor[];
  /** goodsNo(문자열 키) → 이 세션 노출 횟수 */
  impressionCounts: Record<string, number>;
  /** 최근 노출 상품 목록 (최신 앞, 중복 없음) */
  recentImpressions: number[];
  /** 이 세션에서 찜 해제된 상품 — 장기 반영 시 앵커 제거 */
  removed: number[];
  /** 스타일 탐색 부스트가 유지될 남은 노출 수 (0 = 부스트 꺼짐) */
  boostRemaining: number;
}

export interface LongTermProfile {
  schemaVersion: number;
  anchors: Anchor[];
  updatedAtMs: number;
}

export function emptySession(sessionId: string): SessionProfile {
  return {
    sessionId,
    anchors: [],
    impressionCounts: {},
    recentImpressions: [],
    removed: [],
    boostRemaining: 0,
  };
}

export function emptyLongTerm(): LongTermProfile {
  return { schemaVersion: PROFILE_SCHEMA_VERSION, anchors: [], updatedAtMs: 0 };
}

function pruneAnchors(anchors: Anchor[], max: number): Anchor[] {
  if (anchors.length <= max) return anchors;
  return [...anchors].sort((a, b) => b.weight - a.weight).slice(0, max);
}

export interface ProfileAction {
  type: ProfileActionType;
  goodsNo: number;
  nowMs: number;
  gender?: AnchorGender;
}

export function applyAction(
  session: SessionProfile,
  action: ProfileAction,
): SessionProfile {
  if (action.type === "unwish") {
    return {
      ...session,
      anchors: session.anchors.filter((a) => a.goodsNo !== action.goodsNo),
      removed: session.removed.includes(action.goodsNo)
        ? session.removed
        : [...session.removed, action.goodsNo],
    };
  }
  const seen = session.impressionCounts[String(action.goodsNo)] ?? 0;
  const gain = SIGNAL_WEIGHTS[action.type] / (1 + IMPRESSION_DAMPING * seen);
  const existing = session.anchors.find((a) => a.goodsNo === action.goodsNo);
  const anchors = existing
    ? session.anchors.map((a) =>
        a.goodsNo === action.goodsNo
          ? {
              ...a,
              weight: a.weight + gain,
              lastMs: action.nowMs,
              // 성별이 있으면 갱신, 없으면 기존 값 유지
              gender: action.gender ?? a.gender,
            }
          : a,
      )
    : [
        ...session.anchors,
        {
          goodsNo: action.goodsNo,
          weight: gain,
          lastMs: action.nowMs,
          gender: action.gender,
        },
      ];
  return {
    ...session,
    anchors: pruneAnchors(anchors, SESSION_ANCHOR_MAX),
    // 다시 긍정 신호를 주면 제거 목록에서 빼서 앵커로 복귀할 수 있게 한다
    removed: session.removed.filter((g) => g !== action.goodsNo),
    boostRemaining:
      action.type === "style_explore"
        ? STYLE_BOOST_IMPRESSIONS
        : session.boostRemaining,
  };
}

export function applyImpression(
  session: SessionProfile,
  goodsNo: number,
): SessionProfile {
  const key = String(goodsNo);
  let counts: Record<string, number> = {
    ...session.impressionCounts,
    [key]: (session.impressionCounts[key] ?? 0) + 1,
  };
  const countKeys = Object.keys(counts);
  if (countKeys.length > IMPRESSION_COUNT_MAX) {
    // 횟수 높은 것만 남긴다 (낮은 항목은 보정에 덜 중요)
    const kept = countKeys
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, IMPRESSION_COUNT_MAX);
    counts = Object.fromEntries(kept.map((k) => [k, counts[k]]));
  }
  const recent = [
    goodsNo,
    ...session.recentImpressions.filter((g) => g !== goodsNo),
  ].slice(0, RECENT_IMPRESSIONS_MAX);
  return {
    ...session,
    impressionCounts: counts,
    recentImpressions: recent,
    boostRemaining: Math.max(0, session.boostRemaining - 1),
  };
}

/**
 * 세션 종료 시 장기 반영 (설계 §6): 장기 앵커를 한 세션 단위로 감쇠시키고,
 * 세션 앵커 가중치를 더하며, 세션의 찜 해제를 장기에도 적용한다.
 */
export function foldSessionIntoLongTerm(
  longTerm: LongTermProfile,
  session: SessionProfile,
  nowMs: number,
): LongTermProfile {
  const decayed = new Map<number, Anchor>();
  for (const anchor of longTerm.anchors) {
    if (session.removed.includes(anchor.goodsNo)) continue;
    decayed.set(anchor.goodsNo, {
      ...anchor,
      weight: anchor.weight * DECAY_PER_SESSION,
    });
  }
  for (const anchor of session.anchors) {
    const existing = decayed.get(anchor.goodsNo);
    decayed.set(anchor.goodsNo, {
      goodsNo: anchor.goodsNo,
      weight: (existing?.weight ?? 0) + anchor.weight,
      lastMs: Math.max(existing?.lastMs ?? 0, anchor.lastMs),
      // 한쪽에만 성별이 있으면 있는 쪽 값을 취한다
      gender: anchor.gender ?? existing?.gender,
    });
  }
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    anchors: pruneAnchors([...decayed.values()], LONG_ANCHOR_MAX),
    updatedAtMs: nowMs,
  };
}

/** 멀티탭 병합 (설계 §6): 앵커 합집합 + 가중 최대 (마지막 쓰기 우선 아님) */
export function mergeLongTerm(a: LongTermProfile, b: LongTermProfile): LongTermProfile {
  const merged = new Map<number, Anchor>();
  for (const anchor of [...a.anchors, ...b.anchors]) {
    const existing = merged.get(anchor.goodsNo);
    if (!existing || anchor.weight > existing.weight) {
      // 가중 최대 쪽을 취하되, 성별은 한쪽에만 있어도 잃지 않는다
      merged.set(anchor.goodsNo, {
        ...anchor,
        gender: anchor.gender ?? existing?.gender,
      });
    } else if (!existing.gender && anchor.gender) {
      merged.set(anchor.goodsNo, { ...existing, gender: anchor.gender });
    }
  }
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    anchors: pruneAnchors([...merged.values()], LONG_ANCHOR_MAX),
    updatedAtMs: Math.max(a.updatedAtMs, b.updatedAtMs),
  };
}

/** 우세 성별 판정 모수가 되는 최소 앵커 수 — 시작값, 실측으로 튜닝 */
export const GENDER_MIN_ANCHORS = 3;

/** 우세 성별로 판정하는 가중 비율 기준 — 시작값, 실측으로 튜닝 */
export const GENDER_SHARE_THRESHOLD = 0.6;

/**
 * 기기 앵커 목록에서 우세 성별을 판정한다 (설계: 성별 피드 하드 필터 2단계).
 * '공용'·성별 미상 앵커는 모수에서 제외한다. 풀림은 별도 이력 없이 매번
 * 같은 계산으로 자동 대칭이다(히스테리시스 없음 — YAGNI).
 */
export function deriveDominantGender(anchors: Anchor[]): "남성" | "여성" | null {
  const gendered = anchors.filter(
    (a): a is Anchor & { gender: "남성" | "여성" } =>
      a.gender === "남성" || a.gender === "여성",
  );
  if (gendered.length < GENDER_MIN_ANCHORS) return null;

  const totalWeight = gendered.reduce((sum, a) => sum + a.weight, 0);
  if (totalWeight <= 0) return null;

  const maleWeight = gendered
    .filter((a) => a.gender === "남성")
    .reduce((sum, a) => sum + a.weight, 0);
  const femaleWeight = totalWeight - maleWeight;

  if (maleWeight / totalWeight >= GENDER_SHARE_THRESHOLD) return "남성";
  if (femaleWeight / totalWeight >= GENDER_SHARE_THRESHOLD) return "여성";
  return null;
}
