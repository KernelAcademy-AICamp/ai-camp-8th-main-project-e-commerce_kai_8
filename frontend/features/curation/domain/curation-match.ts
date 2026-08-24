// FOR YOU 개인화 — 내가 반응한 상품이 어느 큐레이션에 걸리는지 판정하고 점수를 매긴다.
// 계획: docs/plans/2026-08-20-foryou-curation-personalization.md 3단계

import type { CurationViews } from "@/shared/profile/curation-views";
import { IMPRESSION_DAMPING } from "@/shared/profile/profile-rules";

/** 큐레이션 규칙 중 제목으로 판정 가능한 부분 (backend/scripts/gen_curation_rules.py 산출) */
export interface CurationRule {
  /** 하나라도 제목에 있으면 걸린다 */ kw: string[];
  /** 하나라도 있으면 걸리지 않는다 */ not: string[];
}

/** 앵커 = 내가 반응한 상품. 가중치는 BROWSE 피드와 같은 것을 쓴다(찜 4 · 판매처 이동 6 …) */
export interface AnchorTitle {
  title: string;
  weight: number;
}

/**
 * 희소도의 분모 — 노출 자격이 있는 티셔츠 수(2026-08 실측 226,195).
 * 정확할 필요는 없다. 큐레이션끼리의 **상대** 순위만 정하는 값이라, 분모가 조금
 * 틀려도 모든 큐레이션의 점수가 같은 방향으로 움직여 순서가 바뀌지 않는다.
 */
const CATALOG_SIZE = 226_000;

function matches(title: string, rule: CurationRule): boolean {
  const t = title.toLowerCase();
  if (rule.not.some((w) => t.includes(w.toLowerCase()))) return false;
  return rule.kw.some((w) => t.includes(w.toLowerCase()));
}

/**
 * 좁은 큐레이션일수록 걸렸을 때 점수를 많이 준다 (검색의 IDF와 같은 꼴).
 *
 * 이게 없으면 "여름에 입는 얇은 반팔"(8,180건)처럼 넓은 큐레이션이 거의 모두에게
 * 걸려 항상 뽑히고, 개인화가 아니라 인기순이 된다. 고양이(1,151건)는 5.3배,
 * 여름(8,180건)은 3.3배 — 같은 한 번 걸려도 좁은 쪽이 1.6배 무겁다.
 */
export function rarityBonus(n: number): number {
  return Math.log(CATALOG_SIZE / Math.max(n, 1));
}

/**
 * 여러 번 보여준 큐레이션은 점수를 깎는다 — BROWSE 피드의 자기강화 보정과 **같은 식**
 * (profile-rules의 IMPRESSION_DAMPING).
 *
 * 이게 없으면 취향이 굳은 사람에게 매번 똑같은 6장이 나온다. 한 번 보여줄 때마다
 * 0.77배 → 0.63배로 줄어, 1등과 7등의 차이가 크면 자리를 지키고 근소하면 돌아간다.
 * 0으로 만들지는 않는다 — 좋아하는 것이 영영 사라지면 그것도 개인화가 아니다.
 */
export function viewDamping(seen: number): number {
  return 1 / (1 + IMPRESSION_DAMPING * seen);
}

export interface ScoredCuration {
  key: string;
  score: number;
}

/** 큐레이션 키 → 앵커와의 코사인 (c_curation_rank). 없는 키는 벡터 몫이 0이다. */
export type CurationVectors = Record<string, number | undefined>;

/**
 * 합친 점수에서 **벡터가 갖는 몫**. 나머지가 키워드 몫이다.
 *
 * 둘을 남긴 이유 — 벡터는 제목에 낱말이 없어도 닮은 것을 잡지만 "왜 이게 1등인지"를
 * 설명하지 못하고, 키워드는 설명은 되지만 제목에 낱말이 없으면 아무것도 못 잡는다.
 * 벡터 조회가 실패하면 키워드 몫만 남아 예전 순서가 그대로 나온다.
 */
export const VECTOR_WEIGHT = 0.5;

/**
 * 앵커로 큐레이션 점수를 매긴다 — 키워드 몫과 벡터 몫을 섞어 **0점은 빼고** 높은 순.
 * 동점은 원래 순서(기본 정렬)를 지킨다 — 흔들리는 화면보다 예측 가능한 쪽이 낫다.
 *
 * 두 몫은 **각자의 최댓값으로 나눠 0~1로 맞춘 뒤** 섞는다. 키워드 점수는 앵커 가중치의
 * 합이라 수십~수백이고 코사인은 0.7~0.9라, 그냥 더하면 키워드가 벡터를 덮는다.
 * 같은 수로 나누는 것이라 **한쪽만 있을 때의 순서는 나누기 전과 같다.**
 */
export function scoreCurations(
  curations: { key: string; n: number }[],
  rules: Record<string, CurationRule | undefined>,
  anchors: AnchorTitle[],
  views: CurationViews = {},
  vectors: CurationVectors = {},
): ScoredCuration[] {
  // 코사인은 0.70~0.88의 좁은 띠다 — 절대값을 그대로 쓰면 어느 큐레이션이든 높은 점수를
  // 받아 순위가 거의 안 갈린다. 가장 낮은 것을 0으로 내려 **차이만** 남긴다.
  const cosines = curations
    .map((c) => vectors[c.key])
    .filter((v): v is number => v !== undefined);
  const floor = cosines.length > 0 ? Math.min(...cosines) : 0;

  const raw = curations.map(({ key, n }, index) => {
    const rule = rules[key];
    const hit = rule
      ? anchors.reduce((sum, a) => (matches(a.title, rule) ? sum + a.weight : sum), 0)
      : 0;
    const cos = vectors[key];
    return {
      key,
      index,
      kw: hit * rarityBonus(n),
      // 희소도는 벡터에도 건다. 넓은 큐레이션의 대표 벡터는 "평균적인 티셔츠"에 가까워
      // 누구에게나 어중간하게 높다 — 안 걸면 인기순으로 되돌아간다.
      vec: cos === undefined ? 0 : (cos - floor) * rarityBonus(n),
    };
  });

  const maxKw = Math.max(0, ...raw.map((r) => r.kw));
  const maxVec = Math.max(0, ...raw.map((r) => r.vec));

  return raw
    .map((r) => ({
      key: r.key,
      index: r.index,
      score:
        ((maxKw > 0 ? (r.kw / maxKw) * (1 - VECTOR_WEIGHT) : 0) +
          (maxVec > 0 ? (r.vec / maxVec) * VECTOR_WEIGHT : 0)) *
        viewDamping(views[r.key] ?? 0),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ key, score }) => ({ key, score }));
}

/**
 * 점수 순으로 앞자리를 채우고 **나머지는 기본 순서 그대로** 뒤에 잇는다.
 *
 * 걸린 큐레이션이 첫 화면 수보다 적어도 화면이 비지 않는다(계획 제약). 목록 전체를
 * 돌려주므로 뒤 묶음이 붙은 뒤에도 같은 배열 하나만 쓰면 된다.
 */
export function orderByTaste<T extends { key: string; n: number }>(
  curations: T[],
  rules: Record<string, CurationRule | undefined>,
  anchors: AnchorTitle[],
  views: CurationViews = {},
  vectors: CurationVectors = {},
): T[] {
  // 제목을 못 받아도 벡터만으로 정렬한다 — 둘 다 없을 때만 기본 순서다.
  if (anchors.length === 0 && Object.keys(vectors).length === 0) return curations;
  const scored = scoreCurations(curations, rules, anchors, views, vectors);
  if (scored.length === 0) return curations;
  const picked = new Set(scored.map((s) => s.key));
  const byKey = new Map(curations.map((c) => [c.key, c]));
  return [
    ...scored.map((s) => byKey.get(s.key)).filter((c): c is T => c !== undefined),
    ...curations.filter((c) => !picked.has(c.key)),
  ];
}
