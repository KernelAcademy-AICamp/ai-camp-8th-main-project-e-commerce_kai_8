// LLM Relation Linker의 atomic 출력 계약(v2, 설계 §4.2 개정 — codex).
// nested clause 대신 mention별 flat 귀속 + OR 그룹만 받는다. 작은 모델이 경직된 중첩 구조를
// 못 만들어 89% schema_error가 났던 문제를 완화한다(clause 컴파일은 서버가 소유).
// 서버는 이 값을 신뢰하지 않고 검증(compile-atomic)한다. 파서는 '진짜 구조 오류'만 통째
// 거부하고(리포트에 코드), 사소한 여분 필드는 무시한다.

export type AtomicTarget =
  "base" | "print" | "placement" | "graphic" | "external" | "unresolved";

export interface AtomicAssignment {
  mentionRef: string; // mXX
  target: AtomicTarget;
  targetAnchorRef?: string; // aXX — 귀속 근거(base/print/placement/graphic일 때 권장)
}

export interface AtomicOrGroup {
  memberRefs: string[]; // 같은 필드 내 OR로 묶인 mention들(2개↑)
  operatorRef: string; // 원문 '이나/또는' operator id
}

export interface AtomicProposal {
  assignments: AtomicAssignment[];
  orGroups: AtomicOrGroup[];
}

/** 파서 리포트 — 통째 거부여도 원인 코드를 남긴다(no_proposal 뭉개기 금지). */
export interface AtomicParseReport {
  proposal?: AtomicProposal;
  errors: string[];
}

const TARGETS: ReadonlySet<string> = new Set([
  "base",
  "print",
  "placement",
  "graphic",
  "external",
  "unresolved",
]);

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

export function parseAtomicProposal(raw: unknown): AtomicParseReport {
  const errors: string[] = [];
  const r = rec(raw);
  if (!r) return { errors: ["not_object"] };

  const rawAssign = r.assignments;
  if (!Array.isArray(rawAssign)) return { errors: ["assignments_missing"] };

  const assignments: AtomicAssignment[] = [];
  for (const a of rawAssign) {
    const ar = rec(a);
    if (!ar) {
      errors.push("assignment_not_object");
      continue;
    }
    const mentionRef = ar.mentionRef;
    const target = ar.target;
    if (typeof mentionRef !== "string") {
      errors.push("assignment_ref_not_string");
      continue;
    }
    if (typeof target !== "string" || !TARGETS.has(target)) {
      errors.push("assignment_target_invalid");
      continue;
    }
    const targetAnchorRef =
      typeof ar.targetAnchorRef === "string" ? ar.targetAnchorRef : undefined;
    if (ar.targetAnchorRef !== undefined && typeof ar.targetAnchorRef !== "string") {
      errors.push("assignment_anchor_not_string");
      continue;
    }
    assignments.push({ mentionRef, target: target as AtomicTarget, targetAnchorRef });
  }

  // orGroups는 없으면 빈 배열(관용). 있으면 형태 검증.
  const orGroups: AtomicOrGroup[] = [];
  if (r.orGroups !== undefined) {
    if (!Array.isArray(r.orGroups))
      return { errors: [...errors, "orGroups_not_array"] };
    for (const g of r.orGroups) {
      const gr = rec(g);
      if (!gr || !Array.isArray(gr.memberRefs) || typeof gr.operatorRef !== "string") {
        errors.push("orGroup_shape");
        continue;
      }
      const memberRefs = gr.memberRefs.filter(
        (x): x is string => typeof x === "string",
      );
      if (memberRefs.length !== gr.memberRefs.length) {
        errors.push("orGroup_member_not_string");
        continue;
      }
      orGroups.push({ memberRefs, operatorRef: gr.operatorRef });
    }
  }

  // 구조 오류가 하나라도 있으면 통째 거부(부분 수용 금지). 단 원인 코드는 보존.
  if (errors.length > 0) return { errors };
  return { proposal: { assignments, orGroups }, errors: [] };
}

/** 관측용 raw 귀속 — atomic assignment에 mention surface·canon을 붙인다(base/print 역전 측정). */
export interface AtomicRawAssignment {
  mentionRef: string;
  surface: string;
  canon?: string;
  target: AtomicTarget;
  targetAnchorRef?: string;
}

export function deriveAtomicRawAssignments(
  frame: { mentions: { id: string; surface: string; canon?: string }[] },
  proposal: AtomicProposal,
): AtomicRawAssignment[] {
  const byId = new Map(frame.mentions.map((m) => [m.id, m]));
  return proposal.assignments.map((a) => {
    const m = byId.get(a.mentionRef);
    return {
      mentionRef: a.mentionRef,
      surface: m?.surface ?? "",
      canon: m?.canon,
      target: a.target,
      targetAnchorRef: a.targetAnchorRef,
    };
  });
}
