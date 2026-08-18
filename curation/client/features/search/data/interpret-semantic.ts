// LLM 의미 해석기(QueryInterpretation) 호출 — 2차 출하선 shadow(설계 §4.2·§5.2·§8.2).
// LLM은 "사용자 표현 → DB 통제어휘 후보" 번역만 한다. SQL·강제 수준·검색 결과를 정하지 않는다.
// 프롬프트에는 통제어휘와 해석 지침만 넣는다(전체 상품 데이터·DB 행 금지 — §4.2).
// 모든 실패(타임아웃·파싱·스키마)는 null — 요청 실패가 아니라 "해석 없음"(§8.4).

import { CANON_COLORS, VOCAB_VERSION } from "./colorway-vocab";

const BASE_URL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_MODEL ?? "meta/llama-3.1-8b-instruct";
const TIMEOUT_MS = 6000;

export const SEMANTIC_PROMPT_VERSION = "semantic-interpret@v4"; // v4: 유행·트렌드 계열 무채색 선호 예시 고정

const SYSTEM_PROMPT = `너는 티셔츠 검색 쿼리의 "색 표현 → 통제어휘 후보" 번역기다. 검색하거나 상품을 고르지 않는다.

허용된 캐논 색(이 값만 candidates에 사용 가능):
${CANON_COLORS.join(", ")}

대상(target) 구분 규칙 — 표현이 무엇의 색인지 먼저 판별:
- garment_base: 옷 바탕(티) 자체의 색. 예: "시커먼 티", "검은 반팔"
- print: 프린팅·그림·글씨의 잉크색. 예: "푸르딩딩한 프린팅", "빨간 로고"
- external_context: 옷이 아닌 외부 사물의 색(신발·피부·바지 등). 이 색을 옷 조건으로 쓰면 안 된다. 예: "까무잡잡한 피부에 어울리는", "노란 신발이랑 신을"
- unknown: 대상 판단 불가

해석 지침:
- 감각·구어 표현은 가장 가까운 캐논 색 후보 1~3개로. 예: 푸르딩딩한→[블루,네이비], 시커먼→[블랙], 누리끼리한→[옐로우,베이지]
- 확신 없는 색을 지어내지 말 것. 후보를 못 정하면 resolution=unresolved에 candidates=[].
- 팔레트에 없는 전통색·계열색은 명도·채도가 가장 가까운 후보만: 와인색·버건디→[레드], 카멜→[브라운], 라벤더→[퍼플]. 핑크처럼 명도가 크게 다른 색을 고르지 말 것.
- 유행·트렌드 계열 표현(유행하는·요즘 스타일·트렌디한·핫한)은 target=garment_base, candidates=[화이트,블랙,그레이](무난한 기본색 선호)로 일관되게 출력할 것.
- evidence는 반드시 쿼리 원문에 그대로 존재하는 부분문자열(오프셋·수정 금지).
- 원문에 없는 표현·가격·브랜드를 만들지 말 것.
- 색을 나타내는 표현만 출력할 것. 의류명(티셔츠·반팔·티), 핏(오버핏), 위치(등판) 등 색이 아닌 단어는 expressions에 넣지 말 것. 색 표현이 하나도 없으면 {"expressions":[]}.
- candidates는 최대 3개. 후보를 좁힐 수 없으면 unresolved.

resolution: exact(정확 표현) | family(계열) | semantic(감각·구어) | unresolved(후보 불가)

JSON만 출력:
{"expressions":[{"surface":"표현","target":"garment_base|print|external_context|unknown","candidates":["캐논색"],"resolution":"exact|family|semantic|unresolved","evidence":"원문 부분문자열"}]}

예시 입력: "까무잡잡한 피부에 어울리는 시커먼 티인데 푸르딩딩한 프린팅"
예시 출력: {"expressions":[{"surface":"까무잡잡한","target":"external_context","candidates":["브라운"],"resolution":"semantic","evidence":"까무잡잡한 피부"},{"surface":"시커먼","target":"garment_base","candidates":["블랙"],"resolution":"semantic","evidence":"시커먼 티"},{"surface":"푸르딩딩한","target":"print","candidates":["블루","네이비"],"resolution":"semantic","evidence":"푸르딩딩한 프린팅"}]}`;

export interface SemanticShadowMeta {
  modelId: string;
  promptVersion: string;
  vocabVersion: string;
  latencyMs: number;
}

function extractContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : null;
}

function parseJsonObject(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 의미 해석 LLM 호출 — 실패는 전부 null(해석 없음 폴백). */
export async function interpretSemantic(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ raw: unknown; meta: SemanticShadowMeta } | null> {
  const trimmed = query.trim();
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!trimmed || !apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  const startedAt = Date.now();
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
        max_tokens: 500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const payload: unknown = await res.json();
    const content = extractContent(payload);
    const raw = content ? parseJsonObject(content) : null;
    if (!raw) return null;
    return {
      raw,
      meta: {
        modelId: MODEL,
        promptVersion: SEMANTIC_PROMPT_VERSION,
        vocabVersion: VOCAB_VERSION,
        latencyMs: Date.now() - startedAt,
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
