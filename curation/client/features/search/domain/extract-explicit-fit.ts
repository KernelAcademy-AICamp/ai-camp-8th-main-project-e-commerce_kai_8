// 결정적 핏 파서 — llm=off 경로 전용. facet 핏 어휘(루즈·슬림·오버)에 정확 매핑되는
// 명시 표현만 인식(보수적 — bare "오버" 같은 다의어는 제외).
export interface ExplicitFit {
  fits: string[];
  consumedTokens: string[];
}

const FIT_ALIASES: Record<string, string> = {
  오버핏: "오버",
  오버사이즈: "오버",
  오버사이즈핏: "오버",
  루즈핏: "루즈",
  슬림핏: "슬림",
};

export function extractExplicitFit(query: string): ExplicitFit | null {
  const fits = new Set<string>();
  const consumed = new Set<string>();
  for (const raw of query.split(/\s+/)) {
    const t = raw.replace(/[은는이가을를도의]$/, "");
    const fit = FIT_ALIASES[raw] ?? FIT_ALIASES[t];
    if (fit) {
      fits.add(fit);
      consumed.add(raw);
    }
  }
  if (fits.size === 0) return null;
  return { fits: [...fits].sort(), consumedTokens: [...consumed] };
}
