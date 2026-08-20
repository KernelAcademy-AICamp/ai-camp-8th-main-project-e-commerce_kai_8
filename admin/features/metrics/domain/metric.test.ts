import { describe, expect, it } from "vitest";

import {
  findDuplicateIds,
  findWriteKeywords,
  formatCell,
  type MetricDefinition,
  sortMetrics,
  toTable,
} from "./metric";

function definition(id: string, order: number, sql = "select 1"): MetricDefinition {
  return { id, order, sql, title: id, why: "테스트" };
}

describe("sortMetrics", () => {
  it("order가 작은 것부터 놓는다", () => {
    const sorted = sortMetrics([
      definition("b", 20),
      definition("a", 10),
      definition("c", 30),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("order가 같으면 id 사전순 — 화면 순서가 흔들리지 않게", () => {
    const sorted = sortMetrics([definition("zebra", 10), definition("apple", 10)]);
    expect(sorted.map((d) => d.id)).toEqual(["apple", "zebra"]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const original = [definition("b", 20), definition("a", 10)];
    sortMetrics(original);
    expect(original.map((d) => d.id)).toEqual(["b", "a"]);
  });
});

describe("findDuplicateIds", () => {
  it("중복이 없으면 빈 배열", () => {
    expect(findDuplicateIds([definition("a", 1), definition("b", 2)])).toEqual([]);
  });

  it("중복된 id를 집어낸다", () => {
    expect(
      findDuplicateIds([definition("a", 1), definition("a", 2), definition("b", 3)]),
    ).toEqual(["a"]);
  });
});

describe("findWriteKeywords", () => {
  it("읽기 SQL은 통과한다", () => {
    expect(findWriteKeywords("select count(*) from c_events")).toEqual([]);
  });

  it("쓰기 SQL을 집어낸다", () => {
    expect(findWriteKeywords("delete from c_events")).toContain("delete");
    expect(findWriteKeywords("DROP TABLE c_events")).toContain("drop");
  });

  it("단어 일부가 우연히 겹치는 것은 잡지 않는다", () => {
    // "updated_at" 컬럼 때문에 멀쩡한 지표가 막히면 안 된다
    expect(findWriteKeywords("select updated_at from c_events")).toEqual([]);
    expect(findWriteKeywords("select created_at from c_events")).toEqual([]);
  });
});

describe("toTable", () => {
  it("컬럼 이름을 그대로 머리글로 쓴다", () => {
    const table = toTable(
      ["전체 이벤트", "최근 7일"],
      [{ "전체 이벤트": 10656, "최근 7일": 42 }],
    );
    expect(table.columns).toEqual(["전체 이벤트", "최근 7일"]);
    expect(table.rows).toEqual([["10,656", "42"]]);
  });

  it("결과가 0행이어도 컬럼은 남는다", () => {
    // 컬럼까지 사라지면 "정상 0건"이 빈 상자로 보여 실패와 구분되지 않는다
    const table = toTable(["기기", "건수"], []);
    expect(table.columns).toEqual(["기기", "건수"]);
    expect(table.rows).toEqual([]);
  });

  it("컬럼 순서대로 값을 배치한다", () => {
    const table = toTable(["b", "a"], [{ a: "1", b: "2" }]);
    expect(table.rows).toEqual([["2", "1"]]);
  });
});

describe("formatCell", () => {
  it("null과 undefined는 값 없음 표시로", () => {
    expect(formatCell(null)).toBe("—");
    expect(formatCell(undefined)).toBe("—");
  });

  it("빈 문자열은 값 없음과 구분한다", () => {
    expect(formatCell("")).toBe("");
  });

  it("숫자는 천 단위로 끊는다", () => {
    expect(formatCell(10656)).toBe("10,656");
  });

  it("0을 값 없음으로 만들지 않는다", () => {
    expect(formatCell(0)).toBe("0");
  });

  it("false를 값 없음으로 만들지 않는다", () => {
    expect(formatCell(false)).toBe("false");
  });
});
