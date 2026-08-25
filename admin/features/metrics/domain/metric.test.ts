import { describe, expect, it } from "vitest";

import {
  asLink,
  CARD_SPANS,
  cardSpan,
  findDuplicateIds,
  findWriteKeywords,
  formatCell,
  isReadOnlyStart,
  type MetricDefinition,
  metricsForScreen,
  needsCumulativeNote,
  parseScreen,
  sortMetrics,
  spanClass,
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

describe("카드 너비", () => {
  it("안 정하면 통칸이다", () => {
    // 지금까지 모든 카드가 통칸이었다. 값을 안 넣은 카드가 갑자기 좁아지면 안 된다.
    expect(cardSpan({ id: "a", order: 1, sql: "select 1", title: "a", why: "" })).toBe(
      12,
    );
  });

  it("정한 만큼 차지한다", () => {
    expect(
      cardSpan({ id: "a", order: 1, sql: "select 1", title: "a", why: "", span: 7 }),
    ).toBe(7);
  });

  it("쓸 수 있는 너비마다 클래스가 있다", () => {
    // Tailwind는 글자를 이어붙여 만든 클래스를 못 알아본다. 미리 적어 둔 것만 나온다.
    for (const span of CARD_SPANS) {
      expect(spanClass(span)).toContain(`col-span-${String(span)}`);
    }
  });

  it("좁은 화면에서는 전부 통칸이 된다", () => {
    // 상자수염과 흐름도는 좁으면 못 읽는다. 나란히 두느니 세로로 쌓는다.
    for (const span of CARD_SPANS) {
      if (span === 12) continue;
      expect(spanClass(span)).toContain("col-span-12");
      expect(spanClass(span)).toContain("lg:");
    }
  });
});

describe("누적 경고", () => {
  const card = (cumulative?: boolean): MetricDefinition => ({
    id: "a",
    order: 1,
    sql: "select 1",
    title: "a",
    cumulative,
  });

  it("누적 지표를 시간 창 없이 보면 알린다", () => {
    // 「전체」는 처음부터 다 합친 값이라 **좋아져도 안 보인다.** 실측:
    // 앞 5일 80.9% → 뒤 5일 63.2%로 좋아졌는데 누적으로는 74.7%다.
    expect(needsCumulativeNote(card(true), false)).toBe(true);
  });

  it("기간이나 날짜를 고르면 안 알린다", () => {
    expect(needsCumulativeNote(card(true), true)).toBe(false);
  });

  it("누적이 아닌 지표는 알리지 않는다", () => {
    // 세션 퍼널·일별 막대는 창을 안 골라도 뜻이 흐려지지 않는다
    expect(needsCumulativeNote(card(false), false)).toBe(false);
    expect(needsCumulativeNote(card(), false)).toBe(false);
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

describe("toTable — 차트가 쓸 원본 숫자", () => {
  it("글자와 숫자를 함께 담는다", () => {
    // 차트는 길이와 좌표를 계산해야 하므로 숫자가 필요하다. 글자 "1,457"을 되돌려
    // 읽는 방식은 쓰지 않는다 — 쉼표·단위·로케일이 섞이면 조용히 틀린다.
    const table = toTable(["본 상품"], [{ "본 상품": 1457 }]);
    expect(table.rows).toEqual([["1,457"]]);
    expect(table.values).toEqual([[1457]]);
  });

  it("숫자가 아닌 칸은 값이 없다", () => {
    const table = toTable(["기기", "건수"], [{ 기기: "4eb3aac8", 건수: 6 }]);
    expect(table.values).toEqual([[null, 6]]);
  });

  it("데이터베이스가 큰 수를 글자로 주면 숫자로 읽는다", () => {
    // pg는 bigint·numeric을 문자열로 준다. 그대로 두면 차트가 못 그린다.
    const table = toTable(["세션 수", "비율"], [{ "세션 수": "260", 비율: "53.5" }]);
    expect(table.values).toEqual([[260, 53.5]]);
  });

  it("숫자로 보이지 않는 글자는 숫자로 읽지 않는다", () => {
    // "08-25"를 8빼기25로 읽거나 "4eb3aac8"을 지수로 읽으면 그림이 조용히 틀린다
    const table = toTable(
      ["날짜", "기기", "빈칸"],
      [{ 날짜: "2026-08-25", 기기: "4eb3aac8", 빈칸: "" }],
    );
    expect(table.values).toEqual([[null, null, null]]);
  });

  it("값이 없으면 숫자도 없다", () => {
    const table = toTable(["건수"], [{ 건수: null }]);
    expect(table.rows).toEqual([["—"]]);
    expect(table.values).toEqual([[null]]);
  });

  it("0은 값이 없는 것과 다르다", () => {
    // 0을 null로 뭉개면 "안 했다"와 "모른다"가 같아진다
    const table = toTable(["찜"], [{ 찜: 0 }]);
    expect(table.values).toEqual([[0]]);
  });

  it("행이 0개여도 터지지 않는다", () => {
    expect(toTable(["건수"], []).values).toEqual([]);
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

describe("화면 나누기", () => {
  it("화면 이름으로 지표를 고른다", () => {
    const 지표 = [
      { ...definition("a", 1), screen: "overview" as const },
      { ...definition("b", 2), screen: "retention" as const },
      { ...definition("c", 3), screen: "overview" as const },
    ];
    expect(metricsForScreen(지표, "overview").map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("고른 화면의 순서는 그대로 지킨다", () => {
    const 지표 = [
      { ...definition("늦은", 9), screen: "overview" as const },
      { ...definition("이른", 1), screen: "overview" as const },
    ];
    expect(metricsForScreen(지표, "overview").map((m) => m.id)).toEqual([
      "이른",
      "늦은",
    ]);
  });

  it("모르는 화면 이름이면 개요로 본다", () => {
    // 주소를 손으로 고치다 오타가 나도 빈 화면이 뜨면 안 된다
    expect(parseScreen("없는화면")).toBe("overview");
    expect(parseScreen(undefined)).toBe("overview");
  });

  it("아는 화면 이름은 그대로 쓴다", () => {
    expect(parseScreen("retention")).toBe("retention");
  });
});
