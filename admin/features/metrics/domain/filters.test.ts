import { describe, expect, it } from "vitest";

import {
  eventFilterSql,
  isNarrowed,
  NO_FILTER,
  parseFilter,
  toParams,
} from "./filters";

describe("좁혀 보기 파라미터", () => {
  it("아무것도 없으면 전체", () => {
    expect(parseFilter({})).toEqual(NO_FILTER);
    expect(isNarrowed(NO_FILTER)).toBe(false);
  });

  it("세션 8자리와 날짜를 받는다", () => {
    const filter = parseFilter({ session: "711ce185", date: "2026-08-23" });
    expect(filter).toEqual({
      session: "711ce185",
      date: "2026-08-23",
      days: null,
      ignored: [],
    });
    expect(toParams(filter)).toEqual(["711ce185", "2026-08-23", null]);
  });

  it("형식이 틀리면 버리되 버렸다고 남긴다", () => {
    // 조용히 전체를 보여주면 좁혀진 화면으로 착각한다
    const filter = parseFilter({ session: "'; drop table c_events--", date: "어제" });
    expect(filter.session).toBeNull();
    expect(filter.date).toBeNull();
    expect(filter.ignored).toEqual(["session", "date"]);
  });

  it("있지도 않은 날짜를 거른다", () => {
    expect(parseFilter({ date: "2026-02-31" }).date).toBeNull();
  });

  it("빈 값은 필터가 아니라 없는 것으로 본다", () => {
    expect(parseFilter({ session: "", date: "" })).toEqual(NO_FILTER);
  });

  it("같은 이름이 여러 번 오면 첫 번째만 쓴다", () => {
    expect(parseFilter({ session: ["711ce185", "deadbeef"] }).session).toBe("711ce185");
  });

  it("값 순서는 $1=세션 · $2=날짜 · $3=기간으로 고정", () => {
    expect(
      toParams({ session: "abcd1234", date: null, days: null, ignored: [] }),
    ).toEqual(["abcd1234", null, null]);
  });
});

describe("기간 선택 (최근 N일)", () => {
  it("허용한 기간만 받는다", () => {
    // 아무 숫자나 받으면 days=99999가 전체 스캔이 되고, 화면은 좁혀진 줄 안다
    expect(parseFilter({ days: "7" }).days).toBe(7);
    expect(parseFilter({ days: "14" }).days).toBe(14);
    expect(parseFilter({ days: "30" }).days).toBe(30);
  });

  it("허용 목록에 없으면 버리되 버렸다고 남긴다", () => {
    const filter = parseFilter({ days: "9999" });
    expect(filter.days).toBeNull();
    expect(filter.ignored).toEqual(["days"]);
  });

  it("숫자가 아니면 버린다", () => {
    expect(parseFilter({ days: "일주일" }).days).toBeNull();
    expect(parseFilter({ days: "7; drop table c_events" }).days).toBeNull();
  });

  it("없으면 전체 기간이다", () => {
    expect(parseFilter({}).days).toBeNull();
    expect(NO_FILTER.days).toBeNull();
  });

  it("기간만 골라도 좁혀 보는 중이다", () => {
    expect(isNarrowed({ session: null, date: null, days: 7, ignored: [] })).toBe(true);
  });

  it("SQL이 $3으로 기간을 받는다", () => {
    expect(eventFilterSql()).toContain("($3)");
  });
});

describe("값 순서 계약 — 늘어나면 조용히 틀린다", () => {
  it("toParams는 정확히 세 값만 낸다", () => {
    // `$1`=세션 `$2`=날짜 `$3`=기간. 여기에 **화면 전용 값을 섞으면 안 된다** —
    // 세션 흐름도의 좁혀 보기(`flow`)는 SQL을 안 바꾸고 그림만 바꾸므로 여기 오면 안 된다.
    // 순서가 밀리면 세션 자리에 다른 값이 들어가 조용히 0건이 된다.
    expect(
      toParams(parseFilter({ session: "abcd1234", date: "2026-08-24", days: "7" })),
    ).toHaveLength(3);
  });
});

describe("날짜 조건은 색인이 먹는 형태여야 한다", () => {
  it("컬럼에 함수를 씌우지 않는다", () => {
    // `(occurred_at at time zone 'Asia/Seoul')::date = $2` 형태는 컬럼을 가공하므로
    // occurred_at 색인을 못 탄다. 실측 17.07ms 대 범위 형태 1.71ms — 10배 차이인데
    // 답은 같았다(둘 다 6,724건). 두 달 뒤 행이 7배가 되면 이 차이도 7배가 된다.
    const sql = eventFilterSql();
    expect(sql).not.toMatch(/\(\s*occurred_at at time zone[^)]*\)\s*::date\s*=/);
  });

  it("범위로 자른다 (시작 이상, 다음 날 미만)", () => {
    const sql = eventFilterSql();
    expect(sql).toContain("occurred_at >=");
    expect(sql).toContain("occurred_at <");
  });

  it("별칭을 주면 범위 조건에도 붙는다", () => {
    const sql = eventFilterSql("e");
    expect(sql).toContain("e.occurred_at >=");
    expect(sql).toContain("e.occurred_at <");
    expect(sql).not.toMatch(/[^.]\boccurred_at/);
  });
});

describe("eventFilterSql — 테이블이 여럿일 때", () => {
  it("별칭을 주면 컬럼에 붙인다", () => {
    // 조인 안에서 별칭 없이 쓰면 데이터베이스가 어느 테이블인지 못 정한다
    // (실제로 「오가며 탐색률」이 session_id is ambiguous로 죽었다)
    const sql = eventFilterSql("e");
    expect(sql).toContain("e.session_id");
    expect(sql).toContain("e.occurred_at");
    expect(sql).not.toMatch(/[^.]\bsession_id/);
  });

  it("별칭이 없으면 컬럼 이름만 쓴다", () => {
    const sql = eventFilterSql();
    expect(sql).toContain("session_id");
    expect(sql).not.toContain(".session_id");
  });

  it("자리표시자 번호는 별칭과 무관하게 그대로다", () => {
    for (const sql of [eventFilterSql(), eventFilterSql("e")]) {
      expect(sql).toContain("($1)");
      expect(sql).toContain("($2)");
    }
  });
});
