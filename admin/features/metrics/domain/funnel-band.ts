// 일렬 퍼널(좁아지는 띠)이 쓸 값. 순수 함수.
//
// **갈래가 없는 퍼널에만 쓴다.** 세션 퍼널처럼 한 대상이 두 갈래에 동시에 속할 수
// 있으면 띠로 그리면 안 된다 — 합이 맞지 않는다. 그건 `session-flow`가 맡는다.

import type { MetricTable } from "./metric";

/** 이 그림이 읽는 컬럼. SQL과의 계약이다 */
const LABEL_COLUMN = "단계";
const VALUE_COLUMN = "도달";

export interface FunnelStep {
  label: string;
  value: number;
  /** 직전 단계 대비 비율(%). 첫 단계는 비교할 앞이 없어 `null` */
  ofPrev: number | null;
}

export interface FunnelModel {
  steps: FunnelStep[];
  /** 첫 단계 값. 띠의 폭을 정한다 */
  top: number;
  /** 마지막 ÷ 첫 단계 (%) */
  overall: number;
  /** 가장 많이 빠진 구간. 단계가 하나면 `null` */
  worst: { from: string; to: string; lost: number } | null;
  /**
   * 앞 단계보다 값이 큰 단계의 이름들.
   *
   * 퍼널에서는 있을 수 없는 값이다. **그림을 넓히는 대신 잘못됐다고 말해야 한다.**
   * 실제로 온보딩 `done`이 첫 단계보다 컸다 — 계측이 앱 재시작을 세고 있었다.
   */
  impossible: string[];
}

export function toFunnelModel(table: MetricTable): FunnelModel | null {
  const labelAt = table.columns.indexOf(LABEL_COLUMN);
  const valueAt = table.columns.indexOf(VALUE_COLUMN);
  if (labelAt < 0 || valueAt < 0 || table.rows.length === 0) return null;

  const steps: FunnelStep[] = table.rows.map((row, index) => {
    const value = table.values[index]?.[valueAt] ?? 0;
    const prev = index === 0 ? null : (table.values[index - 1]?.[valueAt] ?? 0);
    return {
      label: row[labelAt],
      value,
      ofPrev: prev === null || prev === 0 ? null : (100 * value) / prev,
    };
  });

  const top = steps[0].value;
  // 첫 단계가 0이면 띠의 폭을 정할 수 없다. 카드가 「0건」이라고 말하는 편이 낫다.
  if (top <= 0) return null;

  const last = steps[steps.length - 1];
  let worst: FunnelModel["worst"] = null;
  for (let i = 1; i < steps.length; i += 1) {
    const lost = steps[i - 1].value - steps[i].value;
    if (worst === null || lost > worst.lost) {
      worst = { from: steps[i - 1].label, to: steps[i].label, lost };
    }
  }

  return {
    steps,
    top,
    overall: (100 * last.value) / top,
    worst,
    impossible: steps
      .filter((step, i) => i > 0 && step.value > steps[i - 1].value)
      .map((step) => step.label),
  };
}
