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
    "%s — 제목과 설명이 비어 있지 않다",
    (_id, metric) => {
      expect(metric.title.trim()).not.toBe("");
      expect(metric.why.trim()).not.toBe("");
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
