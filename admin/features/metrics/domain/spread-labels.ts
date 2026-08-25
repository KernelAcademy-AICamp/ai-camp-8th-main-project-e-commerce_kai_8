// 이름표가 겹치지 않게 미는 규칙. 순수 함수 — 그리기와 무관하다.

/**
 * 이름표 위치를 최소 간격이 지켜지도록 민다.
 *
 * **마디는 제자리에 두고 이름표만 민다.** 얇은 갈래는 마디 높이가 7px도 안 되는데
 * 이름표는 두 줄이라 26px가 필요하다. 마디까지 벌리면 띠 두께가 세션 수를
 * 나타낸다는 성질이 깨진다 — 그림이 거짓말을 하게 된다. 그래서 이름표만 밀고,
 * 밀린 만큼 마디와 이름표를 잇는 선을 그린다(Sankey 라이브러리들의 방식).
 *
 * **자리가 모자라면 간격을 줄여서라도 범위 안에 둔다.** 넘쳐서 카드 밖으로 나가는
 * 것보다 좁게 붙는 편이 낫다.
 *
 * @param centers 마디 중심의 세로 위치. **오름차순이어야 한다**
 * @param minGap 이름표끼리 최소한 이만큼 떨어진다
 * @param lo 그릴 수 있는 위쪽 한계
 * @param hi 그릴 수 있는 아래쪽 한계
 */
export function spreadLabels(
  centers: readonly number[],
  minGap: number,
  lo: number,
  hi: number,
): number[] {
  const placed = [...centers];
  if (placed.length === 0) return placed;

  // 위에서 아래로 밀어 내린다
  for (let i = 1; i < placed.length; i += 1) {
    if (placed[i] - placed[i - 1] < minGap) placed[i] = placed[i - 1] + minGap;
  }
  // 아래 끝을 넘었으면 아래에서 위로 되민다
  if (placed[placed.length - 1] > hi) {
    placed[placed.length - 1] = hi;
    for (let i = placed.length - 2; i >= 0; i -= 1) {
      if (placed[i + 1] - placed[i] < minGap) placed[i] = placed[i + 1] - minGap;
    }
  }
  // 그래도 위로 넘쳤으면 자리가 모자란 것이다. 범위 안에 고르게 편다.
  if (placed[0] < lo) {
    const span = hi - lo;
    const step = placed.length > 1 ? span / (placed.length - 1) : 0;
    for (let i = 0; i < placed.length; i += 1) placed[i] = lo + step * i;
  }
  return placed;
}
