// 서버 전용: NVIDIA LLM으로 자연어 → 구조화 QueryIntent. enum 주입 + validate-drop + 안전 강등.
import {
  COLORS,
  FITS,
  MATERIALS,
  PATTERNS,
  REVIEW_TAGS,
} from "@/features/search/data/musinsa-vocab";
import { WEAR_CHARS_VOCAB } from "@/features/search/data/wear-chars-vocab";
import {
  EMPTY_INTENT,
  type QueryIntent,
  type SortIntent,
  type StyleFilter,
  WEAR_AXES,
  type WearCharsFilter,
} from "@/features/search/domain/query-intent";

const BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_MODEL ?? "meta/llama-3.1-8b-instruct";

const GENDERS = ["남성", "여성", "공용"] as const;
const SORTS: readonly SortIntent[] = ["relevance", "price_asc", "review_count"];
// promote 가능 키(keywords는 소프트 유지 → 제외)
const PROMOTABLE = ["colors", "patterns", "materials", "fits"] as const;

const SYSTEM_PROMPT = `너는 무신사 반소매 티셔츠 쇼핑몰의 검색어 파서다.
한국어 자연어 검색어를 아래 JSON 스키마로만 변환한다. 설명·코드펜스 없이 JSON 객체 하나만 출력한다.

{
  "gender": "남성" | "여성" | "공용" | null,
  "sizeStd": number[],          // 아래 사이즈 사전으로 변환한 통일 척도(85~120 정수). 없으면 []
  "priceMin": number | null,
  "priceMax": number | null,
  "style": {                    // 각 배열은 아래 목록에서만. 없으면 []
    "colors": string[],
    "patterns": string[],
    "materials": string[],
    "fits": string[],
    "keywords": string[]        // 제목에서 찾을 특징어(그래픽·테마·느낌)+동의어. 일반 의류어·색 제외
  },
  "promote": string[],          // 사용자가 "무조건/반드시/~만"으로 못박은 style 속성 키(colors·patterns·materials·fits)
  "exclude": {                  // "~말고/~빼고/~없는" 대상. 구조는 style과 동일
    "colors": string[], "patterns": string[], "materials": string[], "fits": string[], "keywords": string[]
  },
  "wearChars": {                // 착용감. 각 배열은 아래 목록에서만. 없으면 []. 촉감·두께·비침·신축성·계절을 말할 때만. (핏은 위 style.fits로)
    "촉감": string[], "두께": string[], "비침": string[], "신축성": string[], "계절": string[]
  },
  "reviewTags": string[],       // 아래 리뷰 태그 목록에서만. 사용자의 용도·활동·품질·핏·디자인 인상 표현과 맞는 태그. 없으면 []
  "sort": "relevance" | "price_asc" | "review_count"
}

통제 어휘(각 속성은 반드시 이 목록에서만 선택):
- colors: ${COLORS.join(", ")}
- patterns: ${PATTERNS.join(", ")}
- materials: ${MATERIALS.join(", ")}
- fits: ${FITS.join(", ")}
- wearChars.촉감: ${WEAR_CHARS_VOCAB["촉감"].join(", ")}
- wearChars.두께: ${WEAR_CHARS_VOCAB["두께"].join(", ")}
- wearChars.비침: ${WEAR_CHARS_VOCAB["비침"].join(", ")}
- wearChars.신축성: ${WEAR_CHARS_VOCAB["신축성"].join(", ")}
- wearChars.계절: ${WEAR_CHARS_VOCAB["계절"].join(", ")}

규칙:
- 색: 사용자가 "파랑"처럼 상위색을 말하면 관련 셰이드를 여러 개 담아라(예 파랑→블루, 스카이 블루, 다크 블루, 데님, 연청, 중청, 진청). "무지"→patterns:["단색"], "그래픽/프린팅"→["로고/그래픽","프린트"] 등 의미로 매핑. 목록 밖 값 금지.
- 가격(방향 중요): "N원/N만원 이하·까지·미만·안쪽·이내"→priceMax에만 넣고 priceMin=null. "N원 이상·부터·넘는·초과"→priceMin에만. "N만원대"→priceMin=N만, priceMax=N만+9999. "A~B"→priceMin=A, priceMax=B. ⚠️"이하"를 priceMin에 넣지 마라(자주 하는 실수). 예: "3만원 이하"→priceMin=null, priceMax=30000.
- sort: "싼/저렴/가성비"→price_asc, "리뷰 많은/인기"→review_count, 그 외 relevance.
- promote: 강한 강제("무조건 검정만")일 때만 해당 키. 아니면 [].
- keywords: "티","반팔","티셔츠","옷","상의" 같은 일반어와 색은 넣지 마라.
- 리뷰태그: ${REVIEW_TAGS.join(", ")}
- reviewTags: 사용자의 용도(러닝·골프·커플티·홈웨어 등)·품질(프린팅 튼튼함·보풀 등)·핏·착용감·디자인 인상(디자인귀여움·색상예쁨 등) 표현을 위 리뷰태그 목록 값으로 매핑(여러 개 가능). 표현의 뜻과 태그의 뜻이 직접 대응할 때만 넣어라. 하나의 표현으로 여러 태그를 끌어오지 말고, 그 표현에 가장 가까운 하나만 골라라. 확신 없으면 넣지 마라.
- wearChars: 사용자의 착용감 표현(부드러운·도톰한·쫀쫀한·비침없는 등)을 위 목록 값으로 매핑. 정도를 아우르면 인접값도 함께(예 "부드러운"→촉감:["부드러움","약간|부드러움"]). 값은 목록과 정확히 일치. 언급 없으면 전부 [].
- 계절은 "봄/여름"이 명시되거나 "시원한"(→여름)일 때만. "두꺼운·부드러운·오버핏"만으로 계절을 추측해 넣지 마라.
- ⚠️환각 절대 금지: 사용자가 **명시하지 않은** 색·소재·사이즈·패턴·핏·가격은 넣지 마라. 성별만 말했으면 gender만 채우고 나머지는 전부 빈 값/null. 예 "여자 전용상품만"→gender:"여성"이고 sizeStd·colors·materials 등은 모두 비운다("여자"에서 사이즈 90이나 색을 유추하지 마라). "무지 반팔"→patterns:["단색"]뿐, 색 지어내지 마라.

사이즈 사전(반드시 gender와 함께 해석):
- 글자→cm: XS=85, S=90, M=95, L=100, XL=105, XXL=2XL=110, XXXL=3XL=115, 4XL=120, 5XL=125, 6XL=130
- 여성 44체계→cm: 44=85, 55=90, 66=95, 77=100, 88=105 (44반=85)
- 숫자(85~130)는 그대로. "넉넉하게"면 인접 큰 값도 함께(예 105→[105,110]). 프리사이즈는 sizeStd 비움.

예시:
입력: "남성 블랙 오버핏 95 3만원대"
출력: {"gender":"남성","sizeStd":[95],"priceMin":30000,"priceMax":39000,"style":{"colors":["블랙"],"patterns":[],"materials":[],"fits":["오버"],"keywords":[]},"promote":[],"exclude":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"sort":"relevance"}
입력: "면 말고 파란 반팔 싼거"
출력: {"gender":null,"sizeStd":[],"priceMin":null,"priceMax":null,"style":{"colors":["블루","스카이 블루","다크 블루","데님","연청","중청","진청"],"patterns":[],"materials":[],"fits":[],"keywords":[]},"promote":[],"exclude":{"colors":[],"patterns":[],"materials":["면"],"fits":[],"keywords":[]},"sort":"price_asc"}
입력: "무조건 오버핏 그래픽 티"
출력: {"gender":null,"sizeStd":[],"priceMin":null,"priceMax":null,"style":{"colors":[],"patterns":["로고/그래픽","프린트"],"materials":[],"fits":["오버"],"keywords":[]},"promote":["fits"],"exclude":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"sort":"relevance"}
입력: "부드부드하고 시원한 반팔"
출력: {"gender":null,"sizeStd":[],"priceMin":null,"priceMax":null,"style":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"promote":[],"exclude":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"wearChars":{"촉감":["부드러움","약간|부드러움"],"두께":["얇음","약간 얇음"],"비침":["없음","거의 없음"],"신축성":[],"계절":["여름"]},"sort":"relevance"}
입력: "화이트 면 반팔 3만원 이하"
출력: {"gender":null,"sizeStd":[],"priceMin":null,"priceMax":30000,"style":{"colors":["화이트"],"patterns":[],"materials":["면"],"fits":[],"keywords":[]},"promote":[],"exclude":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"wearChars":{"촉감":[],"두께":[],"비침":[],"신축성":[],"계절":[]},"sort":"relevance"}
입력: "가벼운"
출력: {"gender":null,"sizeStd":[],"priceMin":null,"priceMax":null,"style":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"promote":[],"exclude":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"wearChars":{"촉감":[],"두께":[],"비침":[],"신축성":[],"계절":[]},"reviewTags":["가벼움"],"sort":"relevance"}
입력: "여자 전용상품만 추천해줘"
출력: {"gender":"여성","sizeStd":[],"priceMin":null,"priceMax":null,"style":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"promote":[],"exclude":{"colors":[],"patterns":[],"materials":[],"fits":[],"keywords":[]},"wearChars":{"촉감":[],"두께":[],"비침":[],"신축성":[],"계절":[]},"sort":"relevance"}`;

interface RawStyle {
  colors?: unknown;
  patterns?: unknown;
  materials?: unknown;
  fits?: unknown;
  keywords?: unknown;
}
interface ParsedRaw {
  gender?: unknown;
  sizeStd?: unknown;
  priceMin?: unknown;
  priceMax?: unknown;
  style?: unknown;
  promote?: unknown;
  exclude?: unknown;
  wearChars?: unknown;
  reviewTags?: unknown;
  sort?: unknown;
}

function keepEnum(raw: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const out = raw.filter(
    (x): x is string => typeof x === "string" && allowed.includes(x),
  );
  return [...new Set(out)];
}

function keepFree(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set(out)].slice(0, 8);
}

function styleOf(raw: unknown): StyleFilter {
  const s: RawStyle = typeof raw === "object" && raw !== null ? raw : {};
  return {
    colors: keepEnum(s.colors, COLORS),
    patterns: keepEnum(s.patterns, PATTERNS),
    materials: keepEnum(s.materials, MATERIALS),
    fits: keepEnum(s.fits, FITS),
    keywords: keepFree(s.keywords),
  };
}

function keepWear(raw: unknown): WearCharsFilter {
  const r: Record<string, unknown> =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const out = {} as WearCharsFilter;
  for (const axis of WEAR_AXES) {
    out[axis] = keepEnum(r[axis], WEAR_CHARS_VOCAB[axis]);
  }
  return out;
}

function positiveInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? Math.round(v)
    : undefined;
}

function sanitize(raw: ParsedRaw): QueryIntent {
  const gender =
    typeof raw.gender === "string" &&
    (GENDERS as readonly string[]).includes(raw.gender)
      ? (raw.gender as QueryIntent["gender"])
      : undefined;
  const sizeStd = Array.isArray(raw.sizeStd)
    ? [
        ...new Set(
          raw.sizeStd.filter(
            (n): n is number =>
              typeof n === "number" && Number.isInteger(n) && n >= 85 && n <= 130,
          ),
        ),
      ]
    : [];
  const promote = Array.isArray(raw.promote)
    ? [
        ...new Set(
          raw.promote.filter(
            (k): k is keyof StyleFilter =>
              typeof k === "string" && (PROMOTABLE as readonly string[]).includes(k),
          ),
        ),
      ]
    : [];
  const sort =
    typeof raw.sort === "string" && (SORTS as readonly string[]).includes(raw.sort)
      ? (raw.sort as SortIntent)
      : "relevance";
  return {
    gender,
    sizeStd,
    priceMin: positiveInt(raw.priceMin),
    priceMax: positiveInt(raw.priceMax),
    style: styleOf(raw.style),
    promote,
    exclude: styleOf(raw.exclude),
    wearChars: keepWear(raw.wearChars),
    reviewTags: Array.isArray(raw.reviewTags)
      ? [
          ...new Set(
            raw.reviewTags.filter(
              (t): t is string => typeof t === "string" && REVIEW_TAGS.includes(t),
            ),
          ),
        ]
      : [],
    sort,
  };
}

function extractContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" ? content : null;
}

function parseJsonObject(text: string): ParsedRaw | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;
  try {
    const obj: unknown = JSON.parse(match[0]);
    if (typeof obj !== "object" || obj === null) return null;
    const record = obj as Record<string, unknown>;
    return record;
  } catch {
    return null;
  }
}

export async function parseQueryIntent(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ intent: QueryIntent; degraded: boolean }> {
  const trimmed = query.trim();
  if (!trimmed) return { intent: EMPTY_INTENT, degraded: false };
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { intent: EMPTY_INTENT, degraded: true };

  try {
    const res = await fetchFn(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        // DeepSeek V4 계열은 기본 thinking 모드가 켜져 있어 max_tokens를 추론에 소진하고
        // content가 비는 문제가 있다 — 파싱·번역류 작업이라 비추론 모드로 고정.
        ...(MODEL.includes("deepseek") ? { thinking: { type: "disabled" } } : {}),
        temperature: 0,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed },
        ],
      }),
    });
    if (!res.ok) return { intent: EMPTY_INTENT, degraded: true };
    const payload: unknown = await res.json();
    const content = extractContent(payload);
    const raw = content ? parseJsonObject(content) : null;
    if (!raw) return { intent: EMPTY_INTENT, degraded: true };
    return { intent: sanitize(raw), degraded: false };
  } catch {
    return { intent: EMPTY_INTENT, degraded: true };
  }
}
