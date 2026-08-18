// atomic-proposal.test.ts
import { describe, expect, it } from "vitest";

import { parseAtomicProposal } from "./atomic-proposal";

const valid = {
  assignments: [
    { mentionRef: "m01", target: "print", targetAnchorRef: "a02" },
    { mentionRef: "m02", target: "print", targetAnchorRef: "a02" },
    { mentionRef: "m03", target: "base", targetAnchorRef: "a03" },
  ],
  orGroups: [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
};

describe("parseAtomicProposal", () => {
  it("유효한 atomic 제안을 파싱한다", () => {
    const r = parseAtomicProposal(valid);
    expect(r.errors).toEqual([]);
    expect(r.proposal?.assignments).toHaveLength(3);
    expect(r.proposal?.orGroups[0].memberRefs).toEqual(["m01", "m02"]);
  });

  it("orGroups 없으면 빈 배열로 관용 처리", () => {
    const r = parseAtomicProposal({
      assignments: [{ mentionRef: "m01", target: "base" }],
    });
    expect(r.errors).toEqual([]);
    expect(r.proposal?.orGroups).toEqual([]);
  });

  it("여분 필드는 무시(사소한 형식차로 통째 거부하지 않음)", () => {
    const r = parseAtomicProposal({
      assignments: [{ mentionRef: "m01", target: "base", note: "무시됨" }],
      version: "x",
    });
    expect(r.errors).toEqual([]);
    expect(r.proposal?.assignments[0].mentionRef).toBe("m01");
  });

  it("external·unresolved도 유효 target이다", () => {
    const r = parseAtomicProposal({
      assignments: [
        { mentionRef: "m01", target: "external" },
        { mentionRef: "m02", target: "unresolved" },
      ],
    });
    expect(r.errors).toEqual([]);
    expect(r.proposal?.assignments.map((a) => a.target)).toEqual([
      "external",
      "unresolved",
    ]);
  });

  it("assignments 없으면 통째 거부 + 코드", () => {
    expect(parseAtomicProposal({}).errors).toContain("assignments_missing");
    expect(parseAtomicProposal(null).errors).toContain("not_object");
  });

  it("잘못된 target·비문자열 ref는 통째 거부 + 코드(부분 수용 금지)", () => {
    const r = parseAtomicProposal({
      assignments: [{ mentionRef: "m01", target: "몸통" }],
    });
    expect(r.proposal).toBeUndefined();
    expect(r.errors).toContain("assignment_target_invalid");
    const r2 = parseAtomicProposal({
      assignments: [{ mentionRef: 7, target: "base" }],
    });
    expect(r2.errors).toContain("assignment_ref_not_string");
  });

  it("orGroup 형태 오류는 통째 거부 + 코드", () => {
    const r = parseAtomicProposal({
      assignments: [{ mentionRef: "m01", target: "base" }],
      orGroups: [{ memberRefs: ["m01"] }],
    });
    expect(r.proposal).toBeUndefined();
    expect(r.errors).toContain("orGroup_shape");
  });
});
