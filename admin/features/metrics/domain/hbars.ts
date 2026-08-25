// 가로 막대가 쓸 값. 순수 함수.
//
// **컬럼 순서가 뜻을 정한다** — 첫 칸이 이름, 둘째 칸이 막대 길이, 나머지는 글자.
// 컬럼 이름을 고정하지 않아서 여러 지표가 같은 그림을 쓸 수 있다.

import type { MetricTable } from "./metric";
import { niceScale, type Scale } from "./scale";

export interface HBarRow {
  label: string;
  value: number;
  /** 막대로 그리면 안 되는 값들. 옆에 글자로 붙인다 */
  extras: { column: string; text: string }[];
}

export interface HBarsModel {
  rows: HBarRow[];
  /** 막대 길이를 정하는 축 */
  scale: Scale;
  /** 둘째 칸의 이름. 축 이름으로 쓴다 */
  valueColumn: string;
  /** 값의 합계. 분모를 알아야 비율이 읽힌다 */
  total: number;
}

export function toHBarsModel(table: MetricTable): HBarsModel | null {
  if (table.columns.length < 2 || table.rows.length === 0) return null;
  // 둘째 칸이 숫자가 아니면 길이를 정할 수 없다. 표로 떨어지는 편이 낫다.
  if (table.values.some((row) => row[1] === null)) return null;

  const rows: HBarRow[] = table.rows.map((row, index) => ({
    label: row[0],
    value: table.values[index]?.[1] ?? 0,
    extras: row.slice(2).map((text, i) => ({ column: table.columns[i + 2], text })),
  }));

  return {
    rows,
    scale: niceScale(Math.max(...rows.map((row) => row.value)), 3),
    valueColumn: table.columns[1],
    total: rows.reduce((sum, row) => sum + row.value, 0),
  };
}
