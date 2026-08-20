import { describe, expect, it } from "vitest";

import {
  AXES_IN_ORDER,
  colorChip,
  emptyTasteSummary,
  groupAxes,
  GROUPS_IN_ORDER,
  isStillCollecting,
  LEAD_AXIS,
  readTasteSummary,
} from "./taste-summary";

describe("readTasteSummary", () => {
  it("값이 없으면 빈 요약이다", () => {
    expect(readTasteSummary(null)).toEqual(emptyTasteSummary());
    expect(readTasteSummary(undefined)).toEqual(emptyTasteSummary());
    expect(readTasteSummary("이상한 값")).toEqual(emptyTasteSummary());
  });

  it("앵커 수를 읽는다", () => {
    const s = readTasteSummary({ anchor_count: 12, matched_count: 11 });
    expect(s.anchorCount).toBe(12);
    expect(s.matchedCount).toBe(11);
  });

  it("축을 정해진 순서로 편다", () => {
    const s = readTasteSummary({
      axes: {
        price: { value: 0.4, measured: 5 },
        color_vivid: { value: 0.2, measured: 5 },
      },
    });
    expect(s.axes.map((a) => a.key)).toEqual(["color_vivid", "price"]);
  });

  it("서버가 안 보낸 축은 그리지 않는다", () => {
    // 0으로 채우면 "무채색을 좋아함"으로 읽히는데, 실제로는 잰 적이 없는 것이다.
    const s = readTasteSummary({ axes: { graphic: { value: 0.6, measured: 4 } } });
    expect(s.axes).toHaveLength(1);
    expect(s.axes[0].key).toBe("graphic");
  });

  it("모르는 축 이름은 버린다", () => {
    const s = readTasteSummary({ axes: { 성별: { value: 1, measured: 9 } } });
    expect(s.axes).toEqual([]);
  });

  it("숫자가 아닌 축은 버린다", () => {
    const s = readTasteSummary({
      axes: {
        price: { value: "비쌈", measured: 5 },
        graphic: { value: 0.5, measured: 2 },
      },
    });
    expect(s.axes.map((a) => a.key)).toEqual(["graphic"]);
  });

  it("범위를 벗어난 값은 0~1로 눌러 담는다", () => {
    const s = readTasteSummary({
      axes: {
        price: { value: 1.4, measured: 5 },
        graphic: { value: -0.2, measured: 5 },
      },
    });
    expect(s.axes.find((a) => a.key === "price")?.value).toBe(1);
    expect(s.axes.find((a) => a.key === "graphic")?.value).toBe(0);
  });

  it("색과 브랜드를 읽는다", () => {
    const s = readTasteSummary({
      colors: [{ group: "black", share: 0.5 }],
      brands: [{ name: "커버낫", share: 0.3 }],
    });
    expect(s.colors).toEqual([{ group: "black", share: 0.5 }]);
    expect(s.brands).toEqual([{ name: "커버낫", share: 0.3 }]);
  });

  it("형태가 어긋난 항목은 버린다", () => {
    const s = readTasteSummary({
      colors: [{ group: "black", share: 0.5 }, { group: 7 }, null, "검정"],
      brands: [
        { name: "", share: 0.3 },
        { name: "커버낫", share: 0.3 },
      ],
    });
    expect(s.colors).toHaveLength(1);
    expect(s.brands.map((b) => b.name)).toEqual(["커버낫"]);
  });
});

describe("colorChip", () => {
  it("색군마다 이름과 색값이 있다", () => {
    const chip = colorChip("beige_brown");
    expect(chip?.label).toBeTruthy();
    expect(chip?.hex).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("모르는 색군은 그리지 않는다", () => {
    expect(colorChip("etc")).toBeUndefined();
    expect(colorChip("무지개")).toBeUndefined();
  });
});

describe("isStillCollecting", () => {
  it("카탈로그에서 찾은 앵커가 없으면 모으는 중이다", () => {
    expect(isStillCollecting(emptyTasteSummary())).toBe(true);
    expect(
      isStillCollecting(readTasteSummary({ anchor_count: 3, matched_count: 0 })),
    ).toBe(true);
  });

  it("찾은 앵커가 있으면 보여줄 것이 있다", () => {
    expect(
      isStillCollecting(readTasteSummary({ anchor_count: 3, matched_count: 3 })),
    ).toBe(false);
  });
});

describe("AXES_IN_ORDER", () => {
  it("축마다 양 끝 이름이 있다", () => {
    for (const axis of AXES_IN_ORDER) {
      expect(axis.left).toBeTruthy();
      expect(axis.right).toBeTruthy();
    }
  });

  it("맨 위 축과 묶음에서 파생된다 — 축 목록이 두 군데에 따로 있지 않다", () => {
    expect(AXES_IN_ORDER).toEqual([
      LEAD_AXIS,
      ...GROUPS_IN_ORDER.flatMap((g) => g.axes),
    ]);
  });

  it("맨 위 축은 어느 묶음에도 들어 있지 않다", () => {
    // 묶음에 있으면 소제목 아래에 그려진다. 이 축은 성질이 달라 따로 그린다.
    const inGroups = GROUPS_IN_ORDER.flatMap((g) => g.axes).map((a) => a.key);
    expect(inGroups).not.toContain(LEAD_AXIS.key);
  });

  it("같은 축이 두 묶음에 들어가지 않는다", () => {
    const keys = AXES_IN_ORDER.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("groupAxes", () => {
  const axis = (key: string, value = 0.5, measured = 5) =>
    readTasteSummary({ axes: { [key]: { value, measured } } }).axes[0];

  it("묶음 순서는 커버리지 높은 순으로 고정이다", () => {
    // 잰 개수 순으로 정렬하면 사람마다 카드 모양이 달라져 자기 카드를 기억할 수 없다.
    const groups = groupAxes([
      axis("shoulder", 0.5, 3),
      axis("color_vivid", 0.5, 40),
      axis("price", 0.5, 40),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["print", "value", "silhouette"]);
  });

  it("묶음 안 축 순서도 고정이다", () => {
    const groups = groupAxes([axis("graphic"), axis("color_vivid")]);
    expect(groups[0].axes.map((a) => a.key)).toEqual(["color_vivid", "graphic"]);
  });

  it("축이 하나도 없는 묶음은 소제목째 빠진다", () => {
    // 빈 소제목이 남으면 "실루엣을 잴 수 없었다"가 아니라 "여기 뭔가 있었는데
    // 사라졌다"로 읽힌다.
    const groups = groupAxes([axis("color_vivid")]);
    expect(groups.map((g) => g.key)).toEqual(["print"]);
  });

  it("축이 하나도 없으면 묶음도 없다", () => {
    expect(groupAxes([])).toEqual([]);
  });

  it("맨 위 축은 묶음에 들어가지 않는다", () => {
    // 카드가 소제목 없이 따로 그린다. 여기 섞이면 엉뚱한 묶음에 붙는다.
    expect(groupAxes([axis("cohesion"), axis("price")]).map((g) => g.key)).toEqual([
      "value",
    ]);
  });

  it("묶음마다 소제목이 있다", () => {
    for (const group of GROUPS_IN_ORDER) {
      expect(group.title).toBeTruthy();
    }
  });
});
