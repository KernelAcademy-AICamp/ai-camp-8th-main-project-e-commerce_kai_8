/**
 * 세션 시드와 상품 번호를 섞어 상세 하단 탐색 피드의 시드를 만든다.
 * 같은 입력이면 항상 같은 값 — 상세로 돌아왔을 때 같은 그리드가 재현된다.
 * 반환값은 서버 해시 함수(bigint 인자)에 안전한 음이 아닌 정수다.
 */
export function deriveSeed(sessionSeed: number, goodsNo: number): number {
  let h = Math.imul(sessionSeed >>> 0, 2654435761) ^ Math.imul(goodsNo >>> 0, 40503);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}
