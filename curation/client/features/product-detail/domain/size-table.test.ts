import { describe, expect, it } from "vitest";

import type { SizeMeasureRow } from "@/features/catalog/domain/goods";
import { buildSizeTable } from "@/features/product-detail/domain/size-table";

describe("buildSizeTable", () => {
  it("정상 값은 유지하고 열 union(원 순서)", () => {
    const rows: SizeMeasureRow[] = [
      {
        name: "M",
        items: [
          { name: "총장", value: 66 },
          { name: "어깨너비", value: 45 },
        ],
      },
      {
        name: "L",
        items: [
          { name: "총장", value: 70 },
          { name: "어깨너비", value: 47 },
        ],
      },
    ];
    const t = buildSizeTable(rows);
    expect(t.cols).toEqual(["총장", "어깨너비"]);
    expect(t.rows).toEqual([
      { name: "M", cells: [66, 45] },
      { name: "L", cells: [70, 47] },
    ]);
  });

  it("<=0·>120은 위생처리하고, 전셀 결측인 열은 제거", () => {
    const rows: SizeMeasureRow[] = [
      {
        name: "M",
        items: [
          { name: "총장", value: 66 },
          { name: "소매길이", value: 0 },
        ],
      },
      {
        name: "L",
        items: [
          { name: "총장", value: 70 },
          { name: "어깨너비", value: 550 },
        ],
      },
    ];
    const t = buildSizeTable(rows);
    // 소매길이(0)·어깨너비(550)는 유일 값이 결측이라 열 자체가 사라짐 → 총장만 남음
    expect(t.cols).toEqual(["총장"]);
    expect(t.rows).toEqual([
      { name: "M", cells: [66] },
      { name: "L", cells: [70] },
    ]);
  });

  it("전셀 결측 행은 제거", () => {
    const rows: SizeMeasureRow[] = [
      { name: "화이트 M", items: [{ name: "총장", value: 66 }] },
      {
        name: "블랙 L",
        items: [
          { name: "총장", value: 0 },
          { name: "소매길이", value: 200 },
        ],
      },
    ];
    const t = buildSizeTable(rows);
    expect(t.rows.map((r) => r.name)).toEqual(["화이트 M"]);
    expect(t.cols).toEqual(["총장"]);
  });

  it("모든 값이 결측이면 빈 표(컴포넌트가 숨김)", () => {
    const rows: SizeMeasureRow[] = [
      { name: "블루 M", items: [{ name: "소매길이", value: 0 }] },
      { name: "블루 L", items: [{ name: "소매길이", value: 0 }] },
    ];
    const t = buildSizeTable(rows);
    expect(t.rows).toEqual([]);
    expect(t.cols).toEqual([]);
  });

  it("빈 입력은 빈 표", () => {
    expect(buildSizeTable([])).toEqual({ cols: [], rows: [] });
  });
});
