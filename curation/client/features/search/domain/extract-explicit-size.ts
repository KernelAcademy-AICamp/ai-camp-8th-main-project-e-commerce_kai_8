// 결정적 사이즈 파서 — llm=off(결정적 검색) 경로 전용. "사이즈"가 인접하거나
// 착용 표현(입는·입어요 등)이 붙은 표준 사이즈 숫자만 인식한다(보수적 — 가격·수량 오인 방지).
// 소비한 표현은 제목 토큰 추출에서 제외해야 한다(조건 소유권 D4와 동일 원칙).

export interface ExplicitSize {
  sizeStd: number[];
  /** 원문에서 소비한 표현(제목 필터 재유입 방지용). */
  consumedTokens: string[];
}

const STD_SIZES = new Set([80, 85, 90, 95, 100, 105, 110, 115, 120]);

// ① "사이즈 95(인/짜리/로)?" · "95 사이즈" ② "95 입는/입어요/입고"
const PATTERNS = [
  /사이즈\s*(\d{2,3})\s*(?:인|짜리|로|를|는)?/g,
  /(\d{2,3})\s*사이즈/g,
  /(\d{2,3})\s*입(?:는|어|고|음)/g,
];

export function extractExplicitSize(query: string): ExplicitSize | null {
  const sizes = new Set<number>();
  const consumed = new Set<string>();
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(query)) !== null) {
      const n = Number(m[1]);
      if (!STD_SIZES.has(n)) continue;
      sizes.add(n);
      for (const tok of m[0].split(/\s+/)) if (tok) consumed.add(tok);
    }
  }
  if (sizes.size === 0) return null;
  return { sizeStd: [...sizes].sort((a, b) => a - b), consumedTokens: [...consumed] };
}
