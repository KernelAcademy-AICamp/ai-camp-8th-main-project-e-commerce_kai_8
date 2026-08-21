// PICKS 개인화 — 내가 반응한 상품이 어느 큐레이션에 걸리는지 판정하고 점수를 매긴다.
// 계획: docs/plans/2026-08-20-foryou-curation-personalization.md 3단계

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

export interface ScoredCuration {
  key: string;
  score: number;
}

/**
 * 앵커 제목으로 큐레이션 점수를 매긴다. **0점(걸린 앵커가 없는)은 빼고** 점수 높은 순.
 * 동점은 원래 순서(기본 정렬)를 지킨다 — 흔들리는 화면보다 예측 가능한 쪽이 낫다.
 */
export function scoreCurations(
  curations: { key: string; n: number }[],
  rules: Record<string, CurationRule | undefined>,
  anchors: AnchorTitle[],
): ScoredCuration[] {
  return curations
    .map(({ key, n }, index) => {
      const rule = rules[key];
      if (!rule) return { key, score: 0, index };
      const hit = anchors.reduce(
        (sum, a) => (matches(a.title, rule) ? sum + a.weight : sum),
        0,
      );
      return { key, score: hit * rarityBonus(n), index };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ key, score }) => ({ key, score }));
}

/**
 * 점수 순으로 앞자리를 채우고 **나머지는 기본 순서 그대로** 뒤에 잇는다.
 *
 * 걸린 큐레이션이 첫 화면 수보다 적어도 화면이 비지 않는다(계획 제약). 목록 전체를
 * 돌려주므로 "더보기"를 편 뒤에도 같은 배열 하나만 쓰면 된다.
 */
export function orderByTaste<T extends { key: string; n: number }>(
  curations: T[],
  rules: Record<string, CurationRule | undefined>,
  anchors: AnchorTitle[],
): T[] {
  if (anchors.length === 0) return curations;
  const scored = scoreCurations(curations, rules, anchors);
  if (scored.length === 0) return curations;
  const picked = new Set(scored.map((s) => s.key));
  const byKey = new Map(curations.map((c) => [c.key, c]));
  return [
    ...scored.map((s) => byKey.get(s.key)).filter((c): c is T => c !== undefined),
    ...curations.filter((c) => !picked.has(c.key)),
  ];
}
