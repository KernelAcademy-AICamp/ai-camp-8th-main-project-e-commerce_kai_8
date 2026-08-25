// 큐레이션 상세를 끝까지 본 사람에게 **이어볼 다음 큐레이션 하나**를 고른다.
// 계획: docs/plans/2026-08-25-curation-detail-continue.md

/** 큐레이션 키 → 닮은 순서대로의 다른 키들 (backend/scripts/gen_curation_similar.py 산출) */
export type CurationSimilar = Record<string, string[] | undefined>;

/**
 * 닮은 순서대로 훑어 **이번 방문에 아직 안 본** 첫 번째를 준다.
 *
 * 이미 본 것을 다 빼는 이유 — A에서 B로 이어봤는데 B의 이어보기가 도로 A면 두 장을
 * 오가는 핑퐁이 된다. 직전 하나만 빼도 A→B→C→A는 막지 못하는데, 본 것을 전부 빼면
 * 집합 하나로 끝난다.
 *
 * `available`은 이미 성별로 거르고 취향 순으로 세운 목록이다 — 여기 없는 키는
 * 화면에 없는 큐레이션이라 건너뛴다. 남는 게 없으면 null이고, 그때 화면은
 * 이어보기 자리를 그리지 않는다(예전처럼 마지막 장에서 끝난다).
 */
export function pickNextCuration<T extends { key: string }>(
  current: string,
  similar: CurationSimilar,
  available: T[],
  seen: ReadonlySet<string>,
): T | null {
  const byKey = new Map(available.map((c) => [c.key, c]));
  for (const key of similar[current] ?? []) {
    if (key === current || seen.has(key)) continue;
    const found = byKey.get(key);
    if (found) return found;
  }
  return null;
}
