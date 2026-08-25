// 지표 명단이 지켜야 할 것들. 지표를 추가할 때마다 자동으로 함께 검사된다.

import { describe, expect, it } from "vitest";

import {
  findDuplicateIds,
  findWriteKeywords,
  isReadOnlyStart,
} from "@/features/metrics/domain/metric";

import { METRICS } from "./index";

describe("지표 명단", () => {
  it("비어 있지 않다", () => {
    // 빈 대시보드는 "지표가 없는 것"과 "명단 연결이 끊긴 것"을 구분할 수 없다
    expect(METRICS.length).toBeGreaterThan(0);
  });

  it("id가 겹치지 않는다", () => {
    expect(findDuplicateIds(METRICS)).toEqual([]);
  });

  it.each(METRICS.map((metric) => [metric.id, metric] as const))(
    "%s — 제목이 비어 있지 않다",
    (_id, metric) => {
      expect(metric.title.trim()).not.toBe("");
    },
  );

  it.each(METRICS.map((metric) => [metric.id, metric] as const))(
    "%s — 설명을 뒀으면 빈 값이 아니다",
    (_id, metric) => {
      // 설명은 **없어도 된다.** 제목만으로 뜻이 통하는 카드는 화면을 비우는 편이 낫다.
      // 다만 빈 글자를 넣어 두면 「설명을 쓰려다 만 것」과 구분되지 않는다.
      //
      // ⚠️ 설명을 지웠다고 **이유까지 지우지는 않는다.** 왜 이 지표를 보는지, 무엇을
      //    조심해야 하는지는 지표 파일 맨 위 주석에 남긴다 — 화면에서 빠져도 다음
      //    사람이 파일을 열면 읽을 수 있어야 한다.
      if (metric.why !== undefined) expect(metric.why.trim()).not.toBe("");
    },
  );

  it.each(METRICS.map((metric) => [metric.id, metric] as const))(
    "%s — SQL이 읽기 전용이다",
    (_id, metric) => {
      expect(findWriteKeywords(metric.sql)).toEqual([]);
    },
  );

  it.each(METRICS.map((metric) => [metric.id, metric] as const))(
    "%s — SQL이 조회로 시작한다 (select 또는 with)",
    (_id, metric) => {
      expect(isReadOnlyStart(metric.sql)).toBe(true);
    },
  );

  it.each(METRICS.map((metric) => [metric.id, metric.order] as const))(
    "%s — order가 정해져 있다",
    (_id, order) => {
      // order를 빠뜨리면 0이 되어 맨 위로 올라간다. 유입 카드가 맨 위여야 한다
      expect(order).toBeGreaterThan(0);
    },
  );
});
