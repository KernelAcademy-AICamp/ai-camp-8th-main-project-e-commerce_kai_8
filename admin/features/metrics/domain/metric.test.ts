import { describe, expect, it } from "vitest";

import {
  asLink,
  findDuplicateIds,
  findWriteKeywords,
  formatCell,
  isReadOnlyStart,
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

  it("with 안에 숨은 쓰기도 잡는다", () => {
    // isReadOnlyStart가 with를 허용하므로 이 검사가 유일한 방어선이 된다
    expect(
      findWriteKeywords("with x as (delete from c_events returning 1) select 1"),
    ).toContain("delete");
  });
});

describe("isReadOnlyStart", () => {
  it("select로 시작하면 통과", () => {
    expect(isReadOnlyStart("select 1")).toBe(true);
    expect(isReadOnlyStart("\n  SELECT 1")).toBe(true);
  });

  it("with(CTE)로 시작해도 통과", () => {
    expect(isReadOnlyStart("with s as (select 1) select * from s")).toBe(true);
  });

  it("그 외는 막는다", () => {
    expect(isReadOnlyStart("delete from c_events")).toBe(false);
    expect(isReadOnlyStart("")).toBe(false);
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

describe("asLink", () => {
  it("주소면 마지막 조각을 이름으로 준다", () => {
    expect(asLink("https://www.musinsa.com/products/4212345")).toEqual({
      href: "https://www.musinsa.com/products/4212345",
      label: "4212345",
      external: true,
    });
  });

  it("주소가 아니면 null — 숫자·글자는 그냥 글자로 남는다", () => {
    for (const cell of ["4212345", "—", "impression", "2.53", ""]) {
      expect(asLink(cell)).toBeNull();
    }
  });

  it("좁혀 보기 링크는 같은 탭에서 열고 = 뒤의 값을 보여준다", () => {
    // 파고들다 탭이 쌓이면 개요로 돌아갈 수 없다
    expect(asLink("?session=711ce185")).toEqual({
      href: "?session=711ce185",
      label: "711ce185",
      external: false,
    });
    expect(asLink("?date=2026-08-23")?.label).toBe("2026-08-23");
  });

  it("공백이 섞인 문장은 주소로 보지 않는다", () => {
    // "https://... 참고" 같은 설명 문구가 통째로 링크가 되면 안 된다
    expect(asLink("https://example.com 참고")).toBeNull();
  });
});
