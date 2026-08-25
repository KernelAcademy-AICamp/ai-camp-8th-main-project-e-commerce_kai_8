import { describe, expect, it } from "vitest";

import type { MetricTable } from "./metric";
import { toTable } from "./metric";
import { FLOW_VIEWS, type FlowModel, type FlowView, toFlowModel } from "./session-flow";

/** 모델이 있어야 하는 자리. 없으면 그 자리에서 실패한다 */
function must(table: MetricTable, view: FlowView): FlowModel {
  const model = toFlowModel(table, view);
  if (model === null) throw new Error("모델이 나와야 하는데 null이다");
  return model;
}

/** 실측값 (2026-08-25). 합이 노출 세션 수와 같다: 121+36+6+8+89 = 260 */
function realTable() {
  return toTable(
    ["갈래", "이름", "세션 수"],
    [
      { 갈래: "no_tap", 이름: "클릭 없음", "세션 수": 121 },
      { 갈래: "wish_only", 이름: "찜만", "세션 수": 36 },
      { 갈래: "both", 이름: "둘 다", "세션 수": 6 },
      { 갈래: "outbound_only", 이름: "판매처만", "세션 수": 8 },
      { 갈래: "tap_only", 이름: "행동 없음", "세션 수": 89 },
    ],
  );
}

describe("세션 흐름 — 전체", () => {
  it("갈래를 더하면 노출 세션 수가 된다", () => {
    // 이 성질이 이 지표의 전부다. 안 맞으면 갈래가 겹쳤거나 빠진 것이다.
    const model = must(realTable(), "all");
    const sum = model.leaves.reduce((a, leaf) => a + leaf.count, 0);
    expect(sum + model.dropped).toBe(model.impressions);
    expect(model.impressions).toBe(260);
  });

  it("클릭 세션은 노출에서 클릭 없음을 뺀 값이다", () => {
    const model = must(realTable(), "all");
    expect(model.taps).toBe(139);
    expect(model.dropped).toBe(121);
  });

  it("네 갈래를 순서대로 낸다", () => {
    const model = must(realTable(), "all");
    expect(model.leaves.map((l) => l.label)).toEqual([
      "찜만",
      "둘 다",
      "판매처만",
      "행동 없음",
    ]);
    expect(model.leaves.map((l) => l.count)).toEqual([36, 6, 8, 89]);
  });

  it("마지막 단계는 행동한 세션이다 — 「둘 다」를 두 번 세지 않는다", () => {
    // 찜 42 + 판매처 14 = 56이지만 실제 행동한 세션은 50이다. 6이 겹친다.
    const model = must(realTable(), "all");
    expect(model.reached).toBe(50);
    expect(model.stepLabel).toBe("찜 또는 판매처");
  });
});

describe("세션 흐름 — 좁혀 보기", () => {
  it("찜으로 좁히면 「둘 다」를 합쳐 센다", () => {
    const model = must(realTable(), "wish");
    expect(model.reached).toBe(42); // 36 + 6
    expect(model.leaves.map((l) => l.count)).toEqual([42, 97]); // 139 - 42
    expect(model.leaves[0].label).toBe("찜함");
  });

  it("판매처로 좁히면 「둘 다」를 합쳐 센다", () => {
    const model = must(realTable(), "outbound");
    expect(model.reached).toBe(14); // 8 + 6
    expect(model.leaves.map((l) => l.count)).toEqual([14, 125]);
  });

  it("좁혀도 갈래 합은 클릭 세션 수다", () => {
    for (const view of ["wish", "outbound"] as const) {
      const model = must(realTable(), view);
      expect(model.leaves.reduce((a, l) => a + l.count, 0)).toBe(model.taps);
    }
  });

  it("좁혀 보기에서도 노출·클릭 단계는 그대로다", () => {
    // 필터는 **마지막 단계만** 바꾼다. 앞 단계까지 바뀌면 무엇과 비교하는지 잃는다.
    for (const view of FLOW_VIEWS) {
      const model = must(realTable(), view.id);
      expect(model.impressions).toBe(260);
      expect(model.taps).toBe(139);
    }
  });

  it("겹치는 세션 수를 알려준다", () => {
    // "찜 42" 옆에 "이 중 6개는 판매처 이동도 했다"를 붙일 수 있어야 한다
    expect(must(realTable(), "wish").overlap).toBe(6);
    expect(must(realTable(), "outbound").overlap).toBe(6);
  });
});

describe("세션 흐름 — 망가진 입력", () => {
  it("행이 0개면 모델이 없다", () => {
    // 「정상인데 0건」은 빈 그림이 아니라 카드가 따로 말해야 한다
    expect(toFlowModel(toTable(["갈래", "이름", "세션 수"], []), "all")).toBeNull();
  });

  it("갈래 열쇠 컬럼이 없으면 모델이 없다", () => {
    const table = toTable(["단계", "세션"], [{ 단계: "노출", 세션: 10 }]);
    expect(toFlowModel(table, "all")).toBeNull();
  });

  it("모르는 갈래는 무시하되 아는 갈래는 그대로 센다", () => {
    // SQL에 갈래가 하나 늘어도 화면이 통째로 죽지 않는다
    const table = toTable(
      ["갈래", "이름", "세션 수"],
      [
        { 갈래: "no_tap", 이름: "클릭 없음", "세션 수": 10 },
        { 갈래: "wish_only", 이름: "찜만", "세션 수": 5 },
        { 갈래: "both", 이름: "둘 다", "세션 수": 0 },
        { 갈래: "outbound_only", 이름: "판매처만", "세션 수": 0 },
        { 갈래: "tap_only", 이름: "행동 없음", "세션 수": 3 },
        { 갈래: "cart_only", 이름: "장바구니", "세션 수": 99 },
      ],
    );
    const model = must(table, "all");
    expect(model.impressions).toBe(18);
    expect(model.unknown).toEqual(["cart_only"]);
  });

  it("모든 값이 0이어도 터지지 않는다", () => {
    const table = toTable(
      ["갈래", "이름", "세션 수"],
      [
        { 갈래: "no_tap", 이름: "클릭 없음", "세션 수": 0 },
        { 갈래: "wish_only", 이름: "찜만", "세션 수": 0 },
        { 갈래: "both", 이름: "둘 다", "세션 수": 0 },
        { 갈래: "outbound_only", 이름: "판매처만", "세션 수": 0 },
        { 갈래: "tap_only", 이름: "행동 없음", "세션 수": 0 },
      ],
    );
    expect(toFlowModel(table, "all")).toBeNull();
  });
});
