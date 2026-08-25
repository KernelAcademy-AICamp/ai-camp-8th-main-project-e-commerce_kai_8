// 세션 흐름도가 쓸 값. 순수 함수 — SQL 결과 표를 읽어 그림이 쓸 모양으로 바꾼다.
//
// **SQL이 정본이다.** 여기서 새 숫자를 만들지 않는다. 하는 일은 갈래를 합치고
// 순서를 세우는 것뿐이다.

import type { MetricTable } from "./metric";

/** 마지막 단계를 무엇으로 볼지. 화면의 버튼과 **같아야 한다** */
export const FLOW_VIEWS = [
  { id: "all", label: "전체" },
  { id: "wish", label: "찜" },
  { id: "outbound", label: "판매처 이동" },
] as const;

export type FlowView = (typeof FLOW_VIEWS)[number]["id"];

/** 주소에서 온 값을 읽는다. 모르는 값이면 전체다 — 오타로 빈 화면이 뜨면 안 된다 */
export function parseFlowView(raw: string | undefined): FlowView {
  return FLOW_VIEWS.some((v) => v.id === raw) ? (raw as FlowView) : "all";
}

/**
 * SQL의 `갈래` 열쇠. **이 값은 계약이다** — `metrics/session-funnel.ts`와 같아야 한다.
 * 보이는 이름은 SQL의 `이름` 컬럼에서 가져오므로 여기서 정하지 않는다.
 */
const KEYS = ["no_tap", "wish_only", "both", "outbound_only", "tap_only"] as const;
type Key = (typeof KEYS)[number];

/** 흐름도의 갈래 하나 */
export interface FlowLeaf {
  key: string;
  label: string;
  count: number;
  /** 이탈로 볼 갈래인가. 색을 다르게 준다 */
  dropOff: boolean;
}

export interface FlowModel {
  /** 노출이 있는 세션 = 모든 갈래의 합 */
  impressions: number;
  /** 상품을 클릭한 세션 */
  taps: number;
  /** 클릭까지 못 간 세션 */
  dropped: number;
  /** 마지막 단계에 도달한 세션 */
  reached: number;
  /** 마지막 단계 이름 */
  stepLabel: string;
  /** 클릭 다음에 갈라지는 갈래들. 합이 `taps`와 같다 */
  leaves: FlowLeaf[];
  /** 찜과 판매처를 **둘 다** 한 세션 수. 좁혀 볼 때 겹침을 알리는 데 쓴다 */
  overlap: number;
  /** SQL에 있었지만 모르는 갈래. 화면이 이 사실을 알려야 한다 */
  unknown: string[];
}

/** 표에서 열쇠별 세션 수와 이름을 뽑는다. 없으면 null */
function readCounts(
  table: MetricTable,
): {
  counts: Record<Key, number>;
  labels: Record<Key, string>;
  unknown: string[];
} | null {
  const keyAt = table.columns.indexOf("갈래");
  const labelAt = table.columns.indexOf("이름");
  const countAt = table.columns.indexOf("세션 수");
  if (keyAt < 0 || countAt < 0) return null;

  const counts = { no_tap: 0, wish_only: 0, both: 0, outbound_only: 0, tap_only: 0 };
  const labels: Record<Key, string> = {
    no_tap: "클릭 없음",
    wish_only: "찜만",
    both: "둘 다",
    outbound_only: "판매처만",
    tap_only: "행동 없음",
  };
  const unknown: string[] = [];

  table.rows.forEach((row, index) => {
    const key = row[keyAt];
    // 숫자는 원본에서 읽는다. `rows`의 "1,457" 같은 글자를 되돌려 읽지 않는다.
    const count = table.values[index]?.[countAt] ?? 0;
    if ((KEYS as readonly string[]).includes(key)) {
      counts[key as Key] = count;
      // toTable이 컬럼 수만큼 칸을 채우므로 labelAt이 유효하면 값도 있다
      if (labelAt >= 0) labels[key as Key] = row[labelAt];
    } else {
      // 모르는 갈래가 생겨도 화면을 통째로 죽이지 않는다. 대신 이름을 남겨 알린다.
      unknown.push(key);
    }
  });
  return { counts, labels, unknown };
}

/**
 * 그림이 쓸 값으로 바꾼다. 그릴 것이 없으면 `null`.
 *
 * **`null`과 「모두 0」을 같게 다룬다.** 둘 다 그림이 아니라 카드가 「조회는 됐고 0건」
 * 이라고 말해야 하는 상태다. 빈 그림을 그리면 고장으로 보인다 (설계 §7).
 *
 * **좁혀 보기는 마지막 단계만 바꾼다.** 노출·클릭 단계는 그대로 둔다 — 앞 단계까지
 * 바뀌면 무엇과 비교하고 있는지 잃는다.
 */
export function toFlowModel(table: MetricTable, view: FlowView): FlowModel | null {
  const read = readCounts(table);
  if (read === null) return null;
  const { counts, labels, unknown } = read;

  const impressions =
    counts.no_tap +
    counts.wish_only +
    counts.both +
    counts.outbound_only +
    counts.tap_only;
  if (impressions <= 0) return null;

  const taps = impressions - counts.no_tap;
  const wish = counts.wish_only + counts.both;
  const outbound = counts.outbound_only + counts.both;
  // 「둘 다」를 두 번 세지 않는다. 찜 42 + 판매처 14 = 56이지만 행동한 세션은 50이다.
  const acted = counts.wish_only + counts.both + counts.outbound_only;

  const base = {
    impressions,
    taps,
    dropped: counts.no_tap,
    overlap: counts.both,
    unknown,
  };

  if (view === "wish") {
    return {
      ...base,
      reached: wish,
      stepLabel: "찜",
      leaves: [
        { key: "wish", label: "찜함", count: wish, dropOff: false },
        { key: "not_wish", label: "안 함", count: taps - wish, dropOff: true },
      ],
    };
  }
  if (view === "outbound") {
    return {
      ...base,
      reached: outbound,
      stepLabel: "판매처 이동",
      leaves: [
        { key: "outbound", label: "이동함", count: outbound, dropOff: false },
        { key: "not_outbound", label: "안 함", count: taps - outbound, dropOff: true },
      ],
    };
  }
  return {
    ...base,
    reached: acted,
    stepLabel: "찜 또는 판매처",
    leaves: [
      {
        key: "wish_only",
        label: labels.wish_only,
        count: counts.wish_only,
        dropOff: false,
      },
      { key: "both", label: labels.both, count: counts.both, dropOff: false },
      {
        key: "outbound_only",
        label: labels.outbound_only,
        count: counts.outbound_only,
        dropOff: false,
      },
      {
        key: "tap_only",
        label: labels.tap_only,
        count: counts.tap_only,
        dropOff: true,
      },
    ],
  };
}
