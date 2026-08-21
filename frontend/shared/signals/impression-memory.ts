// 어떤 노출이 이 클릭을 만들었나 — 순수 규칙 (저장은 호출부가 맡는다).
//
// 예전에는 이 기억이 메모리에만 있어 **새로고침하면 지워졌다.** 그러면 그 뒤의
// 클릭은 어느 추천 때문인지 알 수 없어 추천 유형별 성적표에서 통째로 빠졌고,
// 전환율이 실제보다 낮게 나왔다 (계획 2026-08-21 A-1).

/** 상한. 넘으면 오래된 것부터 버린다 — 저장소를 무한히 먹지 않게 하는 안전선이다. */
export const IMPRESSION_MEMORY_LIMIT = 500;

export interface ImpressionEntry {
  goodsNo: number;
  impressionId: string;
  sessionId: string;
}

/** 오래된 것이 앞, 최근이 뒤 */
export type ImpressionMemory = readonly ImpressionEntry[];

/**
 * 이번 노출을 기억한다.
 *
 * **세션이 바뀌면 지난 세션의 기억을 버린다.** 지난 세션의 노출이 이번 세션의
 * 클릭을 설명할 수는 없고, 버리지 않으면 기기 저장소에 영원히 쌓인다.
 */
export function rememberImpression(
  memory: ImpressionMemory,
  goodsNo: number,
  impressionId: string,
  sessionId: string,
): ImpressionEntry[] {
  const kept = memory.filter(
    (entry) => entry.sessionId === sessionId && entry.goodsNo !== goodsNo,
  );
  kept.push({ goodsNo, impressionId, sessionId });
  return kept.slice(-IMPRESSION_MEMORY_LIMIT);
}

/** 이 상품의 최근 노출 ID. 같은 세션에서 본 것만 돌려준다. */
export function impressionIdFor(
  memory: ImpressionMemory,
  goodsNo: number,
  sessionId: string,
): string | undefined {
  return memory.find(
    (entry) => entry.goodsNo === goodsNo && entry.sessionId === sessionId,
  )?.impressionId;
}
