// 의미 해석 검증(설계 §9) — LLM 출력은 여기를 통과한 것만 존재한다.
import { describe, expect, it } from "vitest";

import { validateSemantic } from "./validate-semantic";

const QUERY = "까무잡잡한 피부에 어울리는 시커먼 티인데 푸르딩딩한 프린팅";

describe("validate-semantic", () => {
  it("§13.3 완료 기준: 외부 맥락·바탕·프린트가 분리되고 span은 서버가 계산한다", () => {
    const raw = {
      expressions: [
        {
          surface: "까무잡잡한",
          target: "external_context",
          candidates: ["브라운"],
          resolution: "semantic",
          evidence: "까무잡잡한 피부",
        },
        {
          surface: "시커먼",
          target: "garment_base",
          candidates: ["블랙"],
          resolution: "semantic",
          evidence: "시커먼 티",
        },
        {
          surface: "푸르딩딩한",
          target: "print",
          candidates: ["블루", "네이비"],
          resolution: "semantic",
          evidence: "푸르딩딩한 프린팅",
        },
      ],
    };
    const v = validateSemantic(raw, QUERY);
    expect(v.expressions).toHaveLength(3);
    expect(v.expressions.map((e) => e.target)).toEqual([
      "external_context",
      "garment_base",
      "print",
    ]);
    for (const e of v.expressions) {
      expect(QUERY.slice(e.span[0], e.span[1])).toBe(e.evidence); // 서버 계산 span
    }
  });

  it("§9-1: 원문에 없는 evidence는 버린다", () => {
    const v = validateSemantic(
      {
        expressions: [
          {
            target: "print",
            candidates: ["블랙"],
            resolution: "semantic",
            evidence: "존재하지않는표현",
          },
        ],
      },
      QUERY,
    );
    expect(v.expressions).toHaveLength(0);
    expect(v.rejected.some((r) => r.includes("원문에 없는"))).toBe(true);
  });

  it("§9-2: enum 밖 후보는 제거하고, 색 대상인데 유효 후보가 없으면 표현째 버린다", () => {
    const v = validateSemantic(
      {
        expressions: [
          {
            target: "print",
            candidates: ["딥오션블루", "블루"],
            resolution: "semantic",
            evidence: "푸르딩딩한 프린팅",
          },
          {
            target: "garment_base",
            candidates: ["먹색"],
            resolution: "semantic",
            evidence: "시커먼 티",
          },
        ],
      },
      QUERY,
    );
    expect(v.expressions).toHaveLength(1);
    expect(v.expressions[0].candidates).toEqual(["블루"]); // 딥오션블루 제거
    expect(v.rejected.some((r) => r.includes("유효 후보 없음"))).toBe(true); // 먹색만 있던 표현
  });

  it("허용되지 않은 target·깨진 구조는 조용히 버린다(§9-10)", () => {
    expect(validateSemantic(null, QUERY).expressions).toHaveLength(0);
    expect(
      validateSemantic({ expressions: "not-array" }, QUERY).expressions,
    ).toHaveLength(0);
    const v = validateSemantic(
      {
        expressions: [
          { target: "sql_injection", candidates: ["블랙"], evidence: "시커먼 티" },
        ],
      },
      QUERY,
    );
    expect(v.expressions).toHaveLength(0);
  });

  it("의류명 단독 evidence·후보 과다는 환각으로 거부한다", () => {
    const q = "오버핏 7부 티셔츠";
    const v = validateSemantic(
      {
        expressions: [
          {
            target: "garment_base",
            candidates: ["화이트", "백염", "아이보리", "베이지", "브라운", "네이비"],
            resolution: "semantic",
            evidence: "티셔츠",
          },
        ],
      },
      q,
    );
    expect(v.expressions).toHaveLength(0);
    expect(v.rejected.some((r) => r.includes("의류명 단독"))).toBe(true);

    const v2 = validateSemantic(
      {
        expressions: [
          {
            target: "print",
            candidates: ["블랙", "화이트", "레드", "블루"],
            resolution: "semantic",
            evidence: "오버핏",
          },
        ],
      },
      q,
    );
    expect(v2.expressions).toHaveLength(0);
    expect(v2.rejected.some((r) => r.includes("후보 과다"))).toBe(true);
  });

  it("unresolved는 후보 없이 보존된다(관측·승격 후보 수집용)", () => {
    const v = validateSemantic(
      {
        expressions: [
          {
            target: "unknown",
            candidates: [],
            resolution: "unresolved",
            evidence: "푸르딩딩한",
          },
        ],
      },
      QUERY,
    );
    expect(v.expressions).toHaveLength(1);
    expect(v.expressions[0].candidates).toEqual([]);
  });
});
