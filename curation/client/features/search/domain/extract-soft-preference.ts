// 결정적 소프트 선호 — LLM 경로에서 안정성이 확인된 표현을 결정적 조합 규칙으로 승격(설계 §7).
// 하드필터가 아니라 "랭킹 선호"만 만든다. 현재 규칙: 유행·트렌드 계열 → 무난한 기본색 선호.
// (승격 근거: 2026-08-07 사용자 승인 — "유행하는 옷 → 화이트·블랙·그레이 반영".
//  8B shadow에서 같은 매핑이 관측됐으나 target이 불안정해 결정적 규칙으로 고정.)

export interface SoftPreference {
  colors: string[];
  /** 어떤 표현이 규칙을 발동시켰는지(관측·칩용). */
  evidence: string;
}

const TREND_PATTERN = /유행하는|유행|트렌디한|트렌디|트렌드|핫한/;

export function extractSoftPreference(query: string): SoftPreference | null {
  const m = TREND_PATTERN.exec(query);
  if (!m) return null;
  return { colors: ["화이트", "블랙", "그레이"], evidence: m[0] };
}
