// 결정적 성별 파서 — llm=off 경로 전용. 명시적 성별 단어만 인식(보수적).
import type { QueryIntent } from "./query-intent";

export interface ExplicitGender {
  gender: NonNullable<QueryIntent["gender"]>;
  consumedTokens: string[];
}

const FEMALE = new Set(["여성", "여자", "여성용", "우먼", "우먼스"]);
const MALE = new Set(["남성", "남자", "남성용", "맨즈"]);

export function extractExplicitGender(query: string): ExplicitGender | null {
  for (const raw of query.split(/\s+/)) {
    const t = raw.replace(/[용은는이가의]$/, "");
    if (FEMALE.has(raw) || FEMALE.has(t))
      return { gender: "여성", consumedTokens: [raw] };
    if (MALE.has(raw) || MALE.has(t)) return { gender: "남성", consumedTokens: [raw] };
  }
  return null;
}
