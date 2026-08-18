// compile-atomic.test.ts — atomic IR 컴파일러의 무손실 계약(resolve-semantic 이식).
import { describe, expect, it } from "vitest";

import type { AtomicProposal } from "./atomic-proposal";
import { compileAtomic } from "./compile-atomic";
import { buildQueryFrame } from "./query-frame";

const Q = "검은색이나 하얀색 무늬가 있는 빨간색 티셔츠"; // m01검은색 m02하얀색 m03빨간색 o01이나
const frame = () => buildQueryFrame(Q);

const P = (
  assignments: AtomicProposal["assignments"],
  orGroups: AtomicProposal["orGroups"] = [],
): AtomicProposal => ({
  assignments,
  orGroups,
});

describe("compileAtomic — 정상 해소", () => {
  it("핵심 쿼리: 바탕=레드, 프린트=[블랙,화이트] anyOf → valid_graph", () => {
    const r = compileAtomic(
      frame(),
      P(
        [
          { mentionRef: "m01", target: "print" },
          { mentionRef: "m02", target: "print" },
          { mentionRef: "m03", target: "base" },
        ],
        [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
      ),
    );
    expect(r.disposition).toBe("valid_graph");
    const c = r.graph?.clauses[0];
    expect(c?.base.flatMap((x) => x.values)).toEqual(["레드"]);
    expect(c?.print[0].values.sort()).toEqual(["블랙", "화이트"]);
    expect(c?.print[0].fieldOperatorRef).toBe("o01");
  });
});

describe("compileAtomic — 무손실 검증", () => {
  it("완전성: mention 하나라도 귀속 안 되면 validation_error", () => {
    // m02(하얀색) 누락
    const r = compileAtomic(
      frame(),
      P([
        { mentionRef: "m01", target: "print" },
        { mentionRef: "m03", target: "base" },
      ]),
    );
    expect(r.disposition).toBe("validation_error");
    expect(r.errors).toContain("incomplete_mention");
  });

  it("unknown mention ref면 validation_error", () => {
    const r = compileAtomic(
      frame(),
      P([
        { mentionRef: "m99", target: "base" },
        { mentionRef: "m01", target: "print" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ]),
    );
    expect(r.disposition).toBe("validation_error");
    expect(r.errors).toContain("unknown_mention_ref");
  });

  it("field↔kind 불일치(그래픽 target에 색 mention)면 validation_error", () => {
    const r = compileAtomic(
      frame(),
      P(
        [
          { mentionRef: "m01", target: "print" },
          { mentionRef: "m02", target: "print" },
          { mentionRef: "m03", target: "graphic" }, // 빨간색(color)을 graphic으로
        ],
        [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
      ),
    );
    expect(r.disposition).toBe("validation_error");
    expect(r.errors).toContain("field_kind_mismatch");
  });

  it("같은 필드 2색인데 OR 그룹 없으면 field_multi_without_or", () => {
    // operator 없는 쿼리로 격리(operator 완전성 검사에 먼저 안 걸리게).
    // EQ: m01노란색 m02검정 m03하얀색 — m02·m03을 둘 다 print로, orGroup 없음.
    const r = compileAtomic(
      buildQueryFrame("노란색 신발에 어울리는 검정 무늬 하얀색 티셔츠"),
      P([
        { mentionRef: "m01", target: "external" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "print" },
      ]),
    );
    expect(r.disposition).toBe("validation_error");
    expect(r.errors).toContain("field_multi_without_or");
  });

  it("orGroup이 프레임에 없는 operator를 참조하면 validation_error", () => {
    const r = compileAtomic(
      frame(),
      P(
        [
          { mentionRef: "m01", target: "print" },
          { mentionRef: "m02", target: "print" },
          { mentionRef: "m03", target: "base" },
        ],
        [{ memberRefs: ["m01", "m02"], operatorRef: "o99" }],
      ),
    );
    expect(r.disposition).toBe("validation_error");
    expect(r.errors).toContain("orgroup_unknown_operator");
  });

  it("프레임 operator가 소비 안 되면 validation_error", () => {
    // o01(이나)이 있는데 OR 그룹을 안 만들면 → 하지만 그러면 print 2색이 field_multi_without_or로 먼저 걸림.
    // operator 미소비만 격리: m01=print, m02=external, m03=base → print 1색이라 OR 불필요, o01 미소비
    const r = compileAtomic(
      frame(),
      P([
        { mentionRef: "m01", target: "print" },
        { mentionRef: "m02", target: "external" },
        { mentionRef: "m03", target: "base" },
      ]),
    );
    expect(r.disposition).toBe("validation_error");
    expect(r.errors).toContain("operator_not_consumed");
  });
});

describe("compileAtomic — targetAnchorRef soft(grounding 신호)", () => {
  it("없는 anchor를 근거로 대도 assignment는 유효(경고만)", () => {
    const r = compileAtomic(
      frame(),
      P(
        [
          { mentionRef: "m01", target: "print", targetAnchorRef: "a99" },
          { mentionRef: "m02", target: "print" },
          { mentionRef: "m03", target: "base" },
        ],
        [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
      ),
    );
    expect(r.disposition).toBe("valid_graph");
    expect(r.unknownAnchorRefs).toContain("a99");
  });

  it("base인데 무늬 anchor를 근거로 들어도 raw 귀속이 맞으면 유효(경고만, 과잉거부 금지)", () => {
    // anchor 인용이 종류 모순이어도 실행 의미(kind↔target)는 이미 field_kind로 가드됨.
    const f = frame();
    const 무늬 = f.anchors.find((a) => a.kind === "무늬");
    const r = compileAtomic(
      f,
      P(
        [
          { mentionRef: "m01", target: "print" },
          { mentionRef: "m02", target: "print" },
          { mentionRef: "m03", target: "base", targetAnchorRef: 무늬?.id ?? "a01" },
        ],
        [{ memberRefs: ["m01", "m02"], operatorRef: "o01" }],
      ),
    );
    expect(r.disposition).toBe("valid_graph");
    expect(r.warnings?.some((w) => w.startsWith("anchor_incompatible"))).toBe(true);
  });
});

describe("compileAtomic — 부정 안전거부(Shadow1 범위 밖)", () => {
  it("부정어(말고)가 있으면 unsupported_capability로 안전거부", () => {
    const f = buildQueryFrame("검정 바탕 말고 화이트 프린팅"); // m01검정 m02화이트, 말고=negation
    // 모델이 부정을 긍정으로 오해한 제안이어도 결정적으로 범위 밖 처리
    const r = compileAtomic(
      f,
      P([
        { mentionRef: "m01", target: "base" },
        { mentionRef: "m02", target: "print" },
      ]),
    );
    expect(r.disposition).toBe("unsupported_capability");
    expect(r.errors).toContain("negation");
  });
});

describe("compileAtomic — external·unresolved·빈 clause", () => {
  const EQ = "노란색 신발에 어울리는 검정 무늬 하얀색 티셔츠"; // m01노란색 m02검정 m03하얀색 (operator 없음)
  const ef = () => buildQueryFrame(EQ);

  it("external은 clause에서 분리되고 valid_graph", () => {
    const r = compileAtomic(
      ef(),
      P([
        { mentionRef: "m01", target: "external" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ]),
    );
    expect(r.disposition).toBe("valid_graph");
    expect(r.graph?.external).toEqual([{ surface: "노란색", span: [0, 3] }]);
    expect(r.graph?.clauses[0].base.flatMap((x) => x.values)).toEqual(["화이트"]);
  });

  it("unresolved가 하나라도 있으면 valid_abstain(실행 부적격)", () => {
    const r = compileAtomic(
      ef(),
      P([
        { mentionRef: "m01", target: "unresolved" },
        { mentionRef: "m02", target: "print" },
        { mentionRef: "m03", target: "base" },
      ]),
    );
    expect(r.disposition).toBe("valid_abstain");
    expect(r.graph).toBeUndefined();
  });

  it("모든 색을 external로 몰아 빈 clause면 validation_error", () => {
    const r = compileAtomic(
      ef(),
      P([
        { mentionRef: "m01", target: "external" },
        { mentionRef: "m02", target: "external" },
        { mentionRef: "m03", target: "external" },
      ]),
    );
    expect(r.disposition).toBe("validation_error");
    expect(r.errors).toContain("empty_clause");
  });
});
