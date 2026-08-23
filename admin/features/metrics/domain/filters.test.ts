import { describe, expect, it } from "vitest";

import { isNarrowed, NO_FILTER, parseFilter, toParams } from "./filters";

describe("좁혀 보기 파라미터", () => {
  it("아무것도 없으면 전체", () => {
    expect(parseFilter({})).toEqual(NO_FILTER);
    expect(isNarrowed(NO_FILTER)).toBe(false);
  });

  it("세션 8자리와 날짜를 받는다", () => {
    const filter = parseFilter({ session: "711ce185", date: "2026-08-23" });
    expect(filter).toEqual({ session: "711ce185", date: "2026-08-23", ignored: [] });
    expect(toParams(filter)).toEqual(["711ce185", "2026-08-23"]);
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

  it("값 순서는 $1=세션 · $2=날짜로 고정", () => {
    expect(toParams({ session: "abcd1234", date: null, ignored: [] })).toEqual([
      "abcd1234",
      null,
    ]);
  });
});
