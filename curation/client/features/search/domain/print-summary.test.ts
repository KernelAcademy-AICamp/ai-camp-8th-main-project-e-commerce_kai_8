// 프린트 관측(prints jsonb) → 상세 표 행 변환 검증.
// 핵심 계약: 바탕색×잉크색은 결속 페어로 표시한다(컬러웨이를 섞지 않는다).
import { describe, expect, it } from "vitest";

import type { PrintElement } from "./colorway-evaluate";
import { groupPrintRows, printDetailRows } from "./print-summary";

const el = (over: Partial<PrintElement> = {}): PrintElement => ({
  base_colors: ["네이비"],
  sides: ["앞"],
  graphic_types: ["레터링"],
  colors: ["화이트"],
  colors_status: "확인",
  motif: ["XWAZZY"],
  ...over,
});

describe("printDetailRows — 상세 프린트 표(원소당 1행, 페어 유지)", () => {
  it("위치·바탕·프린트(잉크×종류)·문구를 한 행으로", () => {
    expect(printDetailRows([el()], ["네이비"])).toEqual([
      { side: "앞", base: "네이비", print: "화이트 레터링", motif: "XWAZZY" },
    ]);
  });

  it("위치는 앞→뒤→소매 순서로 정렬·중복 제거", () => {
    const got = printDetailRows(
      [el({ sides: ["소매", "뒤", "앞"], motif: [] })],
      ["네이비"],
    );
    expect(got[0].side).toBe("앞·뒤·소매");
  });

  it("다바탕(배색) 원소는 바탕을 병기한다", () => {
    const got = printDetailRows(
      [el({ base_colors: ["블랙", "화이트"] })],
      ["블랙", "화이트"],
    );
    expect(got[0].base).toBe("블랙·화이트");
  });

  it("판독불가 모티프는 걸러낸다", () => {
    const got = printDetailRows(
      [el({ motif: ["FALCON", "판독불가(해상도 부족)"] })],
      ["네이비"],
    );
    expect(got[0].motif).toBe("FALCON");
  });

  it("긴 모티프는 잘라서 말줄임", () => {
    const got = printDetailRows(
      [
        el({
          motif: ["Attraver sports club For young and Rich Kids Let's cross over"],
        }),
      ],
      ["네이비"],
    );
    expect(got[0].motif.endsWith("…")).toBe(true);
    expect(got[0].motif.length).toBeLessThanOrEqual(25);
  });

  it("무늬 전용(sides=[])은 위치를 '무늬'로 표기", () => {
    const got = printDetailRows(
      [el({ sides: [], graphic_types: ["배색"], colors: [], motif: [] })],
      ["네이비"],
    );
    expect(got).toEqual([{ side: "무늬", base: "네이비", print: "배색", motif: "" }]);
  });

  it("잉크색은 확인 상태에서만 붙는다", () => {
    const got = printDetailRows(
      [el({ colors: null, colors_status: "미촬영", motif: [] })],
      ["네이비"],
    );
    expect(got[0].print).toBe("레터링");
  });

  it("잉크색만 있고 종류가 없으면 '프린트'로 표기", () => {
    const got = printDetailRows([el({ graphic_types: null, motif: [] })], ["네이비"]);
    expect(got[0].print).toBe("화이트 프린트");
  });

  it("바탕은 판매자 colors 표기로 매핑해 보여준다 — 라벨 차콜 → 다크 그레이", () => {
    const got = printDetailRows(
      [el({ base_colors: ["차콜"], motif: [] })],
      ["다크 그레이"],
    );
    expect(got[0].base).toBe("다크 그레이");
  });

  it("판매자 colors에 연결되지 않는 원소(다른 컬러웨이 관측)는 표에서 제외", () => {
    expect(printDetailRows([el({ base_colors: ["블랙"] })], ["화이트"])).toEqual([]);
  });

  it("종류·잉크가 전무한 원소는 행을 만들지 않는다", () => {
    expect(
      printDetailRows([el({ graphic_types: [], colors: [], motif: [] })], ["네이비"]),
    ).toEqual([]);
  });
});

describe("groupPrintRows — 같은 바탕 행 묶기(표에서 바탕 한 번만 표기)", () => {
  it("연속·비연속 관계없이 같은 바탕을 등장 순서대로 한 그룹으로", () => {
    const rows = printDetailRows(
      [
        el({ sides: ["앞"], motif: [] }),
        el({ base_colors: ["블랙"], sides: ["앞"], motif: [] }),
        el({ sides: ["뒤"], motif: [] }),
      ],
      ["네이비", "블랙"],
    );
    const groups = groupPrintRows(rows);
    expect(groups.map((g) => g.base)).toEqual(["네이비", "블랙"]);
    expect(groups[0].rows.map((r) => r.side)).toEqual(["앞", "뒤"]);
    expect(groups[1].rows).toHaveLength(1);
  });
});
