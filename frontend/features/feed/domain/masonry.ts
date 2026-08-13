interface Sized {
  width: number;
  height: number;
}

/**
 * 각 항목을 누적 높이(가로폭 대비 세로 비율 합)가 가장 낮은 열에 순서대로 배치한다.
 * 열 가로폭이 같다는 전제이므로 height/width 합만 비교하면 된다.
 */
export function distributeToColumns<T extends Sized>(
  items: readonly T[],
  columnCount: number,
): T[][] {
  const columns: T[][] = Array.from({ length: columnCount }, () => []);
  const heights = new Array<number>(columnCount).fill(0);

  for (const item of items) {
    let target = 0;
    for (let i = 1; i < columnCount; i++) {
      if (heights[i] < heights[target]) target = i;
    }
    columns[target].push(item);
    heights[target] += item.height / item.width;
  }

  return columns;
}
