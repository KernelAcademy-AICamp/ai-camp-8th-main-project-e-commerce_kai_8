// 컬러웨이 결속 검색 — 정확 표현 결정적 해석기 (LLM 없음).
// 근거: docs/design/2026-08-07-colorway-search-optional-llm-design.md §4.1,
//       docs/design/2026-08-07-colorway-search-kickoff-decisions.md (D4·D5).
// 원칙: 정확한 캐논 표현과 검증된 고정 alias만 조건으로 만든다. 의미 표현(시커먼 등)은
// 미해결로 남기고 하드필터를 만들지 않는다. 부정은 대상 명사와 속성값이 같은 인접
// 명사구에 있을 때만 성립한다. 모든 evidence는 원문 부분문자열이며 span은 서버(이 코드)가 계산한다.

import {
  CANON_COLORS,
  type CanonColor,
  type GraphicType,
  type PlanPlacement,
  VOCAB_VERSION,
} from "../data/colorway-vocab";

// v2: 봉인 평가 50건 반영 — 반팔티·~인데·~된·전체(문맥부) 확장, evidence 확장 규칙 정리(2026-08-07)
export const COLORWAY_RULES_VERSION = "colorway-interpret@v2";

export type ConditionTarget = "base" | "print" | "placement" | "graphic";
export type Polarity = "positive" | "negative";

export interface ColorwayCondition {
  target: ConditionTarget;
  values: string[];
  polarity: Polarity;
  /** 원문 부분문자열. */
  evidence: string;
  /** 원문 기준 [start, end). */
  span: [number, number];
  /** 프린트 측 조건의 객체 묶음 번호(0부터). base 조건은 묶음과 무관하게 -1. */
  segment: number;
}

export interface ColorwayInterpretation {
  conditions: ColorwayCondition[];
  /** 외부 맥락으로 분리된 표현 — 어떤 상품 조건으로도 컴파일 금지. */
  external: string[];
  /** 해석하지 못한 표현 — 하드필터 금지, 승격 후보로 로그. */
  unresolved: string[];
  /** 프린팅 지시어가 존재했는가(속성 없는 '프린팅 존재' 조건 파생용). */
  printMentioned: boolean;
  /** 해석기가 소비한 원문 구간 — 기존 제목 검색어 추출에서 제외해야 한다(D4 조건 소유권). */
  consumedSpans: [number, number][];
  versions: { vocab: string; rules: string };
}

// ── 어휘: 검증된 고정 alias만 (색 표현 골든셋 50건의 direct·high 근거) ──────────────

const COLOR_ALIASES: Record<string, CanonColor> = {
  검정: "블랙",
  검은: "블랙",
  검은색: "블랙",
  까만: "블랙",
  흰: "화이트",
  흰색: "화이트",
  하얀: "화이트",
  하양: "화이트",
  빨간: "레드",
  빨강: "레드",
  노란: "옐로우",
  노랑: "옐로우",
  파란: "블루",
  파랑: "블루",
  회색: "그레이",
};
const COLOR_LOOKUP: ReadonlyMap<string, CanonColor> = new Map([
  ...CANON_COLORS.map((c) => [c, c] as const),
  ...Object.entries(COLOR_ALIASES).map(([k, v]) => [k, v] as const),
]);

const GRAPHIC_ALIASES: Record<string, GraphicType> = {
  레터링: "레터링",
  로고: "로고",
  캐릭터: "캐릭터",
  그래픽: "그래픽",
  스트라이프: "스트라이프",
  도트: "도트",
  체크: "체크",
  배색: "배색",
  카모플라쥬: "카모플라쥬",
  카모: "카모플라쥬",
  그라데이션: "그라데이션",
  타이다이: "타이다이",
  패치워크: "패치워크",
};

// 백프린팅은 위치(뒤)이면서 프린트 지시어이기도 하다.
const PLACEMENT_ALIASES: Record<string, PlanPlacement> = {
  앞: "앞",
  앞판: "앞",
  뒤: "뒤",
  등판: "뒤",
  // '등'은 다의어(나열의 '등') — 위치 조사가 붙은 형태(등에·등에는)만 위치로 인정(pass 5).
  등: "뒤",
  백프린팅: "뒤",
  소매: "소매",
  올오버: "전체",
  // '전체'는 다의어라 위치로 쓸 때만 인정: 조사(전체에)가 붙었거나 바로 뒤에 프린트 지시어가 올 때.
  전체: "전체",
};
const PRINT_INDICATORS = new Set([
  "프린팅",
  "프린트",
  "나염",
  "백프린팅",
  "무늬",
  "무늬가",
]);
const GARMENT_NOUNS = new Set([
  "바탕",
  "티",
  "티셔츠",
  "반팔",
  "반팔티",
  "반팔티셔츠",
  "상의",
  "옷",
]);
const EXTERNAL_NOUNS = new Set([
  "신발",
  "운동화",
  "스니커즈",
  "피부",
  "청바지",
  "바지",
  "슬랙스",
  "데님",
  "가방",
  "모자",
]);
const NEGATION_MARKERS = new Set(["말고", "빼고", "제외", "제외하고", "빼줘"]);
const ABSENCE_MARKERS = new Set(["없는", "없이"]);
// 존재 표현 — 프린팅 표현에 붙는 기능어. 조건은 아니지만 직전 표현이 소비되면 함께 소비해
// 제목 하드필터로 새지 않게 한다(예: "프린팅 있는 검은티"의 '있는').
const EXISTENCE_MARKERS = new Set(["있는", "들어간", "박힌", "새겨진"]);
// 승격 후보 관찰 목록 — 결정적 경로에서는 절대 조건으로 만들지 않는다(설계 §7 승격 파이프라인).
const WATCHLIST_PHRASES = ["빈티지한 느낌"]; // 다어절 우선(최장 일치)
const WATCHLIST_TOKENS = new Set([
  "시커먼",
  "시꺼먼",
  "새카만",
  "푸르딩딩한",
  "퍼런",
  "누런",
  "누리끼리한",
  "까무잡잡한",
  "파스텔톤",
  "형광",
  "빈티지한",
  "빈티지",
]);

// ── 토큰화: 조사 스트립으로 매칭하되 span은 원문 기준 ─────────────────────────────

const PARTICLES_2 = ["에는", "이랑", "으로", "에서", "인데", "이나"];
// OR 접속 조사(색 나열) — 이 조사가 붙은 색은 다음 색과 한 조건(다중값 OR)으로 묶는다.
const OR_SUFFIXES = ["이나", "나", "또는", "혹은"];
const PARTICLES_1 = [
  "는",
  "은",
  "이",
  "가",
  "을",
  "를",
  "에",
  "엔",
  "랑",
  "와",
  "과",
  "로",
  "도",
  "만",
  "의",
  "된", // 활용형: "프린팅된" → 프린팅
];

interface Token {
  raw: string;
  start: number;
  end: number;
  consumed: boolean;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[^\s,.!?·]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
      consumed: false,
    });
  }
  return tokens;
}

/** 토큰의 조사 스트립 변형 문자열들 — 소비 토큰 매칭(제목 추출 제외 목록)에도 쓴다. */
export function particleVariants(raw: string): string[] {
  return variants(raw).map(([v]) => v);
}

/** 조사 스트립 변형들 — 긴 것부터. 각 변형은 (문자열, 원문 소비 길이). */
function variants(raw: string): [string, number][] {
  const out: [string, number][] = [[raw, raw.length]];
  let cur = raw;
  for (let step = 0; step < 2 && cur.length > 1; step++) {
    const two = PARTICLES_2.find((p) => cur.endsWith(p) && cur.length > p.length);
    if (two) {
      cur = cur.slice(0, -two.length);
      out.push([cur, cur.length]);
      continue;
    }
    const one = PARTICLES_1.find((p) => cur.endsWith(p) && cur.length > 1);
    if (one) {
      cur = cur.slice(0, -1);
      out.push([cur, cur.length]);
      continue;
    }
    break;
  }
  return out;
}

interface Classified {
  token: Token;
  color?: { canon: CanonColor; matchedLen: number };
  /** 색+의류명 합성어(검은티·블랙티셔츠 등) — 대상이 옷 바탕으로 확정된 색. */
  isCompositeGarmentColor: boolean;
  graphic?: { canon: GraphicType; matchedLen: number };
  placement?: { canon: PlanPlacement; matchedLen: number };
  isPrintIndicator: boolean;
  printIndicatorLen: number;
  isGarmentNoun: { matchedLen: number } | null;
  isExternalNoun: { matchedLen: number } | null;
  isNegation: boolean;
  isAbsence: boolean;
  isWatchlist: { matchedLen: number } | null;
  /** X색 형태인데 캐논이 아님 → 미해결 색 표현. */
  isUnknownColorish: { matchedLen: number } | null;
  /** 색 뒤에 OR 접속(이나 등)이 붙어 다음 색과 한 조건으로 묶임. */
  orNext: boolean;
}

function classify(token: Token): Classified {
  const c: Classified = {
    token,
    isCompositeGarmentColor: false,
    isPrintIndicator: false,
    printIndicatorLen: 0,
    isGarmentNoun: null,
    isExternalNoun: null,
    isNegation: false,
    isAbsence: false,
    isWatchlist: null,
    isUnknownColorish: null,
    orNext: OR_SUFFIXES.some(
      (suf) => token.raw.endsWith(suf) && token.raw.length > suf.length,
    ),
  };
  for (const [v, len] of variants(token.raw)) {
    if (!c.color) {
      const canon =
        COLOR_LOOKUP.get(v) ??
        (v.endsWith("색") ? COLOR_LOOKUP.get(v.slice(0, -1)) : undefined);
      if (canon) c.color = { canon, matchedLen: len };
      else if (v.endsWith("색") && v.length > 1 && !c.isUnknownColorish)
        c.isUnknownColorish = { matchedLen: len };
    }
    if (!c.graphic && v in GRAPHIC_ALIASES)
      c.graphic = { canon: GRAPHIC_ALIASES[v], matchedLen: len };
    if (!c.placement && v in PLACEMENT_ALIASES)
      c.placement = { canon: PLACEMENT_ALIASES[v], matchedLen: len };
    if (PRINT_INDICATORS.has(v) && !c.isPrintIndicator) {
      c.isPrintIndicator = true;
      c.printIndicatorLen = len;
    }
    if (!c.isGarmentNoun && GARMENT_NOUNS.has(v)) c.isGarmentNoun = { matchedLen: len };
    if (!c.isExternalNoun && EXTERNAL_NOUNS.has(v))
      c.isExternalNoun = { matchedLen: len };
    if (NEGATION_MARKERS.has(v)) c.isNegation = true;
    if (ABSENCE_MARKERS.has(v)) c.isAbsence = true;
    if (!c.isWatchlist && WATCHLIST_TOKENS.has(v)) c.isWatchlist = { matchedLen: len };
  }
  // 색+의류명 합성어(검은티·블랙티셔츠·흰티 등) — 색과 대상(옷 바탕)이 한 토큰에 있다.
  if (!c.color) {
    for (const [v, len] of variants(token.raw)) {
      for (let k = 1; k < v.length; k++) {
        const prefix = v.slice(0, k);
        const suffix = v.slice(k);
        if (!GARMENT_NOUNS.has(suffix)) continue;
        const canon =
          COLOR_LOOKUP.get(prefix) ??
          (prefix.endsWith("색") ? COLOR_LOOKUP.get(prefix.slice(0, -1)) : undefined);
        if (canon) {
          c.color = { canon, matchedLen: len }; // evidence는 합성어 전체
          c.isCompositeGarmentColor = true;
          break;
        }
      }
      if (c.color) break;
    }
  }
  // 색으로 판정되면 미해결 색 표현 후보는 무효(예: 검은색·카키색).
  if (c.color) c.isUnknownColorish = null;
  return c;
}

// ── 본 해석 ──────────────────────────────────────────────────────────────────

export function interpretColorwayQuery(query: string): ColorwayInterpretation {
  const text = query.normalize("NFKC");
  const conditions: ColorwayCondition[] = [];
  const external: string[] = [];
  const unresolved: string[] = [];
  const consumedSpans: [number, number][] = [];
  let printMentioned = false;

  const consume = (start: number, end: number) => consumedSpans.push([start, end]);

  // 0) 다어절 관찰 목록(최장 일치) — 뒤에 외부 명사가 오면 외부 맥락, 아니면 미해결.
  const phraseRanges: [number, number][] = [];
  for (const phrase of WATCHLIST_PHRASES) {
    let idx = text.indexOf(phrase);
    while (idx !== -1) {
      phraseRanges.push([idx, idx + phrase.length]);
      unresolved.push(phrase);
      consume(idx, idx + phrase.length);
      idx = text.indexOf(phrase, idx + phrase.length);
    }
  }
  const inPhrase = (t: Token) =>
    phraseRanges.some(([s, e]) => t.start >= s && t.end <= e);

  const tokens = tokenize(text).filter((t) => !inPhrase(t));
  const cls = tokens.map(classify);
  const commaBoundaries = new Set<number>();
  {
    // 쉼표 위치 이후 첫 토큰 인덱스를 경계로 기록(전방 탐색 중단용).
    const re = /[,]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const commaIndex = m.index;
      const i = cls.findIndex((c) => c.token.start > commaIndex);
      if (i >= 0) commaBoundaries.add(i);
    }
  }

  // 1) 부정 — 보수 규칙: 대상 명사와 속성값이 인접 명사구 안에 있을 때만 must_not.
  for (let i = 0; i < cls.length; i++) {
    const cur = cls[i];
    if (!cur.isNegation || cur.token.consumed) continue;
    const prev = i >= 1 ? cls[i - 1] : undefined;
    const prev2 = i >= 2 ? cls[i - 2] : undefined;
    if (
      prev?.isGarmentNoun &&
      prev2?.color &&
      !prev.token.consumed &&
      !prev2.token.consumed
    ) {
      // 예: "검정 바탕 말고" → base must_not
      const span: [number, number] = [prev2.token.start, cur.token.end];
      conditions.push({
        target: "base",
        values: [prev2.color.canon],
        polarity: "negative",
        evidence: text.slice(span[0], span[1]),
        span,
        segment: -1,
      });
      prev.token.consumed = prev2.token.consumed = cur.token.consumed = true;
      consume(span[0], span[1]);
    } else if (
      prev &&
      (prev.isPrintIndicator || prev.graphic) &&
      prev2?.color &&
      !prev.token.consumed &&
      !prev2.token.consumed
    ) {
      // 예: "화이트 프린팅 말고" → print must_not
      const span: [number, number] = [prev2.token.start, cur.token.end];
      conditions.push({
        target: "print",
        values: [prev2.color.canon],
        polarity: "negative",
        evidence: text.slice(span[0], span[1]),
        span,
        segment: -1,
      });
      prev.token.consumed = prev2.token.consumed = cur.token.consumed = true;
      consume(span[0], span[1]);
    } else if (prev?.color && !prev.token.consumed) {
      // 대상(바탕/프린트) 결정 불가 → 하드 부정 금지, 미해결.
      const span: [number, number] = [prev.token.start, cur.token.end];
      unresolved.push(text.slice(span[0], span[1]));
      prev.token.consumed = cur.token.consumed = true;
      consume(span[0], span[1]);
    } else {
      cur.token.consumed = true;
    }
  }

  // 2) 부재 표현 — 프린팅 없음 검색은 관측 범위 문제(설계 §14.1)로 보류 → 미해결.
  for (let i = 1; i < cls.length; i++) {
    const cur = cls[i];
    if (!cur.isAbsence || cur.token.consumed) continue;
    const prev = cls[i - 1];
    if ((prev.graphic || prev.isPrintIndicator) && !prev.token.consumed) {
      // 선행 위치 토큰("등에")까지 한 표현으로 소비 — 안 물면 '뒤 프린팅 존재' 조건이
      // 생겨 의미가 반전된다(프린팅 없음 검색은 §14.1 보류).
      const prev2 = i >= 2 ? cls[i - 2] : undefined;
      const placementPrev = prev2?.placement && !prev2.token.consumed ? prev2 : null;
      const start = placementPrev ? placementPrev.token.start : prev.token.start;
      const span: [number, number] = [start, cur.token.end];
      unresolved.push(text.slice(span[0], span[1]));
      if (placementPrev) placementPrev.token.consumed = true;
      prev.token.consumed = cur.token.consumed = true;
      consume(span[0], span[1]);
    }
  }

  // 3) 관찰 목록(단어) — 뒤 토큰이 외부 명사면 외부 맥락으로 묶고, 아니면 미해결.
  for (let i = 0; i < cls.length; i++) {
    const cur = cls[i];
    if (!cur.isWatchlist || cur.token.consumed || cur.color) continue;
    const next = i + 1 < cls.length ? cls[i + 1] : undefined;
    if (next?.isExternalNoun && !next.token.consumed) {
      const end = next.token.start + next.isExternalNoun.matchedLen;
      external.push(text.slice(cur.token.start, end));
      cur.token.consumed = next.token.consumed = true;
      consume(cur.token.start, end);
    } else {
      const end = cur.token.start + cur.isWatchlist.matchedLen;
      unresolved.push(text.slice(cur.token.start, end));
      cur.token.consumed = true;
      consume(cur.token.start, end);
    }
  }

  // 4) 색 귀속 — 전방 탐색(쉼표·다음 색·부정 앞까지)으로 대상을 먼저 판별한다.
  //    OR 접속(검은색이나 하얀색)은 연속 색을 한 그룹으로 묶어 같은 대상의 다중값(OR)으로 만든다.
  for (let i = 0; i < cls.length; i++) {
    const cur = cls[i];
    if (!cur.color || cur.token.consumed) continue;
    // 합성어(검은티 등)는 대상이 토큰 안에서 확정 — 전방 탐색 없이 바로 옷 바탕색.
    if (cur.isCompositeGarmentColor) {
      const end = cur.token.start + cur.color.matchedLen;
      const span: [number, number] = [cur.token.start, end];
      conditions.push({
        target: "base",
        values: [cur.color.canon],
        polarity: "positive",
        evidence: text.slice(span[0], span[1]),
        span,
        segment: -1,
      });
      cur.token.consumed = true;
      consume(span[0], span[1]);
      continue;
    }
    // OR 그룹 수집: cur가 orNext면 바로 뒤의 미소비 색을 같은 그룹에 넣고 계속.
    const group = [cur];
    let last = i;
    while (
      cls[last].orNext &&
      last + 1 < cls.length &&
      cls[last + 1].color &&
      !cls[last + 1].token.consumed
    ) {
      group.push(cls[last + 1]);
      last += 1;
    }
    const values = [
      ...new Set(
        group
          .map((g) => g.color?.canon)
          .filter((c): c is CanonColor => c !== undefined),
      ),
    ];
    const groupStart = cur.token.start;
    const attribute = (target: ConditionTarget, end: number) => {
      const span: [number, number] = [groupStart, end];
      conditions.push({
        target,
        values,
        polarity: "positive",
        evidence: text.slice(span[0], span[1]),
        span,
        segment: -1,
      });
      for (const g of group) g.token.consumed = true;
      consume(span[0], span[1]);
    };

    // 그룹 마지막 색 뒤에서부터 대상 명사를 전방 탐색한다.
    let resolved = false;
    for (let j = last + 1; j < Math.min(last + 5, cls.length); j++) {
      if (commaBoundaries.has(j)) break;
      const nxt = cls[j];
      if (nxt.token.consumed || nxt.color || nxt.isNegation) break;
      if (nxt.isExternalNoun) {
        const end = nxt.token.start + nxt.isExternalNoun.matchedLen;
        external.push(text.slice(groupStart, end));
        for (const g of group) g.token.consumed = true;
        nxt.token.consumed = true;
        consume(groupStart, end);
        resolved = true;
        break;
      }
      if (nxt.isPrintIndicator || nxt.graphic) {
        let end =
          nxt.token.start +
          (nxt.graphic?.matchedLen ?? (nxt.printIndicatorLen || nxt.token.raw.length));
        if (nxt.graphic && !nxt.isPrintIndicator) {
          const after = j + 1 < cls.length ? cls[j + 1] : undefined;
          if (after?.isPrintIndicator && !after.token.consumed) {
            end = after.token.start + after.printIndicatorLen;
          }
        }
        attribute("print", end);
        resolved = true;
        break;
      }
      if (nxt.isGarmentNoun) {
        attribute("base", nxt.token.start + nxt.isGarmentNoun.matchedLen);
        nxt.token.consumed = true;
        resolved = true;
        break;
      }
      if (nxt.placement) continue; // 예: "흰색 등판 나염" — 위치를 건너 지시어까지 스캔.
      break;
    }
    if (!resolved) {
      // 후행 명사 없음 → 보수적으로 옷 바탕색.
      const lastG = group[group.length - 1];
      attribute("base", lastG.token.start + (lastG.color?.matchedLen ?? 0));
    }
  }

  // 4.5) 단독 외부 명사 — 색 귀속 이후에 처리(색+외부 명사 조합을 먼저 묶기 위함).
  for (const cur of cls) {
    if (!cur.isExternalNoun || cur.token.consumed || cur.color) continue;
    const end = cur.token.start + cur.isExternalNoun.matchedLen;
    external.push(text.slice(cur.token.start, end));
    cur.token.consumed = true;
    consume(cur.token.start, end);
  }

  // 5) 위치 조건.
  const printEvidenceSpans = conditions
    .filter((c) => c.target === "print")
    .map((c) => c.span);
  for (let i = 0; i < cls.length; i++) {
    const cur = cls[i];
    if (!cur.placement || cur.token.consumed) continue;
    const surface = cur.token.raw.slice(0, cur.placement.matchedLen);
    const hadParticle = cur.token.raw.length > cur.placement.matchedLen;
    const next = i + 1 < cls.length ? cls[i + 1] : undefined;
    const nextIsFreeIndicator =
      !!next &&
      next.isPrintIndicator &&
      !next.token.consumed &&
      !printEvidenceSpans.some(
        ([s, e]) => next.token.start >= s && next.token.end <= e,
      );
    // '전체'·'등'은 다의어 — 위치 조사(전체에·등에)나 바로 뒤 프린트 지시어가 있을 때만 위치로 본다.
    if (
      (surface === "전체" || surface === "등") &&
      !hadParticle &&
      !nextIsFreeIndicator
    )
      continue;
    let end = cur.token.end;
    // 위치 단어가 바로 뒤의 미귀속 프린트 지시어와 하나의 표현을 이루면 evidence를 확장한다
    // (예: "소매 프린팅", "앞에 프린팅"). '올오버'는 자체가 완결 표현이라 확장하지 않는다.
    if (surface !== "올오버" && nextIsFreeIndicator) {
      end = next.token.start + next.printIndicatorLen;
    }
    const span: [number, number] = [cur.token.start, end];
    conditions.push({
      target: "placement",
      values: [cur.placement.canon],
      polarity: "positive",
      evidence: text.slice(span[0], span[1]),
      span,
      segment: -1,
    });
    cur.token.consumed = true;
    consume(span[0], span[1]);
  }

  // 6) 그래픽 유형 조건(부재 규칙에 소비된 것 제외).
  for (const cur of cls) {
    if (!cur.graphic || cur.token.consumed || cur.color) continue;
    const end = cur.token.start + cur.graphic.matchedLen;
    const span: [number, number] = [cur.token.start, end];
    conditions.push({
      target: "graphic",
      values: [cur.graphic.canon],
      polarity: "positive",
      evidence: text.slice(span[0], span[1]),
      span,
      segment: -1,
    });
    cur.token.consumed = true;
    consume(span[0], span[1]);
  }

  // 7) 사전 밖 색 표현(예: 먹색) — 추측 금지, 미해결.
  for (const cur of cls) {
    if (!cur.isUnknownColorish || cur.token.consumed) continue;
    const end = cur.token.start + cur.isUnknownColorish.matchedLen;
    unresolved.push(text.slice(cur.token.start, end));
    cur.token.consumed = true;
    consume(cur.token.start, end);
  }

  // 7.4) bare 프린팅 지시어 — 색·위치에 안 묶인 '프린팅/프린트' 단독은 printExists 신호이자
  //      소비 대상이다(제목 하드필터 재유입 방지). 부정·부재로 지워진 것은 이미 consumed.
  for (const cur of cls) {
    if (cur.token.consumed || !cur.isPrintIndicator) continue;
    const end = cur.token.start + cur.printIndicatorLen;
    consume(cur.token.start, end);
    cur.token.consumed = true;
  }

  // 7.5) 존재 표현('있는' 등) — 직전 토큰이 소비된 프린팅 표현이면 함께 소비(조건 없음).
  for (let i = 1; i < cls.length; i++) {
    const cur = cls[i];
    if (cur.token.consumed) continue;
    const stripped = variants(cur.token.raw).map(([v]) => v);
    if (!stripped.some((v) => EXISTENCE_MARKERS.has(v))) continue;
    const prev = cls[i - 1];
    // 직전 토큰이 소비 플래그가 없어도(지시어는 자체 조건용으로 남긴다) 소비 span에 덮여 있으면 소비된 표현이다.
    const prevCovered =
      prev.token.consumed ||
      consumedSpans.some(([s2, e2]) => prev.token.start >= s2 && prev.token.end <= e2);
    if (prevCovered && (prev.isPrintIndicator || prev.graphic || prev.placement)) {
      cur.token.consumed = true;
      consume(cur.token.start, cur.token.end);
    }
  }

  // 8) 프린팅 언급 여부 — 부재(없는)·부정으로 지워진 지시어는 제외한다.
  printMentioned = cls.some((c) => {
    if (!c.isPrintIndicator) return false;
    const killed =
      unresolved.some((u) => u.includes(c.token.raw)) ||
      conditions.some(
        (cd) => cd.polarity === "negative" && cd.evidence.includes(c.token.raw),
      );
    return !killed;
  });

  // 9) 동일 조건 병합(같은 대상·극성·값 집합 → 최초 evidence 유지).
  const merged: ColorwayCondition[] = [];
  for (const c of conditions.sort((a, b) => a.span[0] - b.span[0])) {
    const dup = merged.find(
      (m) =>
        m.target === c.target &&
        m.polarity === c.polarity &&
        JSON.stringify([...m.values].sort()) === JSON.stringify([...c.values].sort()),
    );
    if (!dup) merged.push(c);
  }

  // 10) 프린트 측 조건의 객체 묶음(segment) 부여 — 선행 위치 표지가 새 묶음을 연다.
  let segment = 0;
  let opened = false;
  for (const c of merged) {
    if (c.target === "base") continue;
    if (c.polarity === "negative") continue;
    if (c.target === "placement") {
      const overlapsExisting = merged.some(
        (o) =>
          o !== c &&
          o.target !== "base" &&
          o.polarity === "positive" &&
          o.span[0] <= c.span[0] &&
          c.span[1] <= o.span[1],
      );
      if (!overlapsExisting) {
        if (opened) segment++;
        opened = true;
        c.segment = segment;
        continue;
      }
    }
    c.segment = segment;
    opened = true;
  }

  return {
    conditions: merged,
    external,
    unresolved,
    printMentioned,
    consumedSpans: consumedSpans.sort((a, b) => a[0] - b[0]),
    versions: { vocab: VOCAB_VERSION, rules: COLORWAY_RULES_VERSION },
  };
}
