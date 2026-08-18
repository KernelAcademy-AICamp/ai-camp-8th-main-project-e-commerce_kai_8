// LLM 의미 해석(QueryInterpretation)의 서버 검증 — 설계 §9.
// LLM은 후보를 제안할 뿐이며, 여기서 검증을 통과한 표현만 시스템에 존재하게 된다.
// 규칙: evidence는 실제 원문 부분문자열(§9-1, span은 서버가 계산 — §5.2), 후보는 캐논
// enum만(§9-2), 외부 맥락은 상품 조건 금지(§9-4 — target으로만 보존), 실패는 조용히 버림(§9-10).

import { type CanonColor, isCanonColor } from "../data/colorway-vocab";

export type SemanticTarget = "garment_base" | "print" | "external_context" | "unknown";
export type SemanticResolution = "exact" | "family" | "semantic" | "unresolved";

export interface SemanticExpression {
  /** 원문 표현(예: "푸르딩딩한"). */
  surface: string;
  target: SemanticTarget;
  /** 캐논 색 후보 — 검증 통과분만. external/unknown은 비어 있을 수 있다. */
  candidates: CanonColor[];
  resolution: SemanticResolution;
  /** 원문 부분문자열(검증됨). */
  evidence: string;
  /** 서버가 계산한 원문 span. */
  span: [number, number];
}

export interface SemanticValidation {
  expressions: SemanticExpression[];
  /** 검증 탈락 사유(관측·로그용). */
  rejected: string[];
}

// 색 표현이 될 수 없는 의류명 — 이것만으로 이루어진 evidence는 환각(예: "티셔츠"→16색).
const GARMENT_ONLY = new Set([
  "티",
  "티셔츠",
  "반팔",
  "반팔티",
  "반팔티셔츠",
  "옷",
  "상의",
  "바탕",
]);
// 프롬프트 계약: 후보는 1~3개. 초과는 "가까운 색"이 아니라 나열 환각이다.
const MAX_CANDIDATES = 3;

const TARGETS = new Set<string>([
  "garment_base",
  "print",
  "external_context",
  "unknown",
]);
const RESOLUTIONS = new Set<string>(["exact", "family", "semantic", "unresolved"]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

/** LLM 원출력 → 검증된 의미 해석. 어떤 실패도 예외 없이 rejected로 흡수한다. */
export function validateSemantic(raw: unknown, query: string): SemanticValidation {
  const rejected: string[] = [];
  const expressions: SemanticExpression[] = [];
  const root = asRecord(raw);
  const list = Array.isArray(root?.expressions) ? root.expressions : null;
  if (!list) return { expressions, rejected: ["expressions 배열 없음"] };

  const text = query.normalize("NFKC");
  const seen = new Set<string>();

  for (const item of list) {
    const r = asRecord(item);
    if (!r) {
      rejected.push("객체 아님");
      continue;
    }
    const surface = typeof r.surface === "string" ? r.surface : "";
    const evidence = typeof r.evidence === "string" ? r.evidence : surface;
    const target = typeof r.target === "string" ? r.target : "";
    const resolution = typeof r.resolution === "string" ? r.resolution : "semantic";

    if (!TARGETS.has(target)) {
      rejected.push(`허용되지 않은 target: ${target || "(없음)"}`);
      continue;
    }
    if (!RESOLUTIONS.has(resolution)) {
      rejected.push(`허용되지 않은 resolution: ${resolution}`);
      continue;
    }
    // §9-1: evidence가 실제 원문에 존재해야 하며 span은 서버가 계산한다(LLM 오프셋 불신).
    const start = evidence ? text.indexOf(evidence) : -1;
    if (start < 0) {
      rejected.push(`원문에 없는 evidence: ${evidence || "(빈 값)"}`);
      continue;
    }
    // 의류명 단독 evidence는 색 표현이 아니다 — 환각 거부.
    if (GARMENT_ONLY.has(evidence.trim())) {
      rejected.push(`의류명 단독 evidence: ${evidence}`);
      continue;
    }
    // §9-2: 후보는 현재 어휘 레지스트리에 있는 값만 남긴다.
    const rawCandidates = Array.isArray(r.candidates) ? r.candidates : [];
    const candidates = rawCandidates.filter(
      (c): c is CanonColor => typeof c === "string" && isCanonColor(c),
    );
    const droppedCount = rawCandidates.length - candidates.length;
    if (droppedCount > 0)
      rejected.push(`enum 밖 후보 ${String(droppedCount)}개 제거 (${evidence})`);
    // 색 대상인데 유효 후보가 하나도 없으면 해석으로서 무의미 — 버린다.
    if ((target === "garment_base" || target === "print") && candidates.length === 0) {
      rejected.push(`유효 후보 없음: ${evidence}`);
      continue;
    }
    // 후보 과다(계약 1~3개 위반)는 색 해석이 아니라 나열 — 표현째 버린다.
    if (candidates.length > MAX_CANDIDATES) {
      rejected.push(`후보 과다(${String(candidates.length)}개): ${evidence}`);
      continue;
    }

    const key = `${evidence}:${target}`;
    if (seen.has(key)) continue;
    seen.add(key);

    expressions.push({
      surface: surface || evidence,
      target: target as SemanticTarget,
      candidates,
      resolution: resolution as SemanticResolution,
      evidence,
      span: [start, start + evidence.length],
    });
  }
  return { expressions, rejected };
}
