// 색 표현 골든셋 무결성 검사 — vocab 재생성 시 표류 방지(계획 단계 3).
// 기대값 실존·표현 중복·케이스 유형별 최소 개수를 기계적으로 고정한다.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { COLORS } from "@/features/search/data/musinsa-vocab";

interface GoldenEntry {
  expression: string;
  expected: string[];
  caseType: "direct" | "series" | "modifier" | "fallback" | "unmapped";
  confidence: "high" | "low";
  source: string;
}

const golden = JSON.parse(
  readFileSync(new URL("./color-expression-golden.json", import.meta.url), "utf8"),
) as { entries: GoldenEntry[] };

describe("color-expression-golden 무결성", () => {
  it("모든 기대값이 현재 색 vocab에 실존한다", () => {
    const vocab = new Set(COLORS);
    const missing = golden.entries.flatMap((e) =>
      e.expected.filter((v) => !vocab.has(v)).map((v) => `${e.expression}→${v}`),
    );
    expect(missing).toEqual([]);
  });

  it("표현 중복이 없다", () => {
    const seen = golden.entries.map((e) => e.expression);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("규모: 전체 30개 이상(설계 §3.2: 30~50)", () => {
    expect(golden.entries.length).toBeGreaterThanOrEqual(30);
    expect(golden.entries.length).toBeLessThanOrEqual(50);
  });

  it("케이스 유형 5종이 각 3개 이상", () => {
    const byType = new Map<string, number>();
    for (const e of golden.entries) {
      byType.set(e.caseType, (byType.get(e.caseType) ?? 0) + 1);
    }
    for (const t of ["direct", "series", "modifier", "fallback", "unmapped"]) {
      expect(byType.get(t) ?? 0, `caseType=${t}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("unmapped는 기대값이 비어 있고, 그 외는 비어 있지 않다", () => {
    for (const e of golden.entries) {
      if (e.caseType === "unmapped") expect(e.expected, e.expression).toEqual([]);
      else expect(e.expected.length, e.expression).toBeGreaterThan(0);
    }
  });

  it("무의미 값(기타색상)은 기대값으로 쓰지 않는다", () => {
    for (const e of golden.entries) {
      expect(e.expected, e.expression).not.toContain("기타색상");
    }
  });
});
