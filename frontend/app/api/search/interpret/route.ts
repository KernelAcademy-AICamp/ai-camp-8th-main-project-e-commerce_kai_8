import { NextResponse } from "next/server";

import {
  emptyPlan,
  INTERPRET_PROMPT,
  isKeywordQuery,
  parsePlan,
  PROMPT_VERSION,
  type QueryPlan,
} from "@/features/feed/search/domain/query-plan";

/**
 * 질의 해석 — 부정과 의도를 읽어 검색 조건으로 옮긴다 (부정 조각 3단계).
 *
 * **왜 라우트 핸들러인가.** LLM 키와 Supabase 서비스 키를 **브라우저에 보내지 않기
 * 위해서다.** 둘 다 서버에서만 읽는다. 캐시 쓰기는 서비스 역할만 할 수 있는데
 * (anon에 열면 누구나 질의 해석을 덮어써 남의 검색 결과를 바꾼다), 그 키가 여기 있다.
 *
 * ⚠️ **이 경로는 필수가 아니다**(설계 S-02). 실패·지연·키 없음은 전부 빈 해석으로
 * 떨어지고, 그러면 검색은 지금까지와 똑같이 동작한다. 해석이 검색을 막아서는 안 된다.
 */

// 문장형만 LLM을 탄다 (설계 S-02). 키워드는 규칙이 이미 잘 처리한다.
const LLM_TIMEOUT_MS = 4_000;

/**
 * 추론을 끈다. **이게 없으면 쓸 수 없다.**
 *
 * `deepseek-v4-flash`는 추론 모델이라 기본값으로 `reasoning_content`를 먼저 뽑는다 —
 * 같은 질의에 **12.6초**가 걸렸다(추론 1,419토큰). 설계 S-02가 허용한 1~2초를 크게 넘는다.
 * `reasoning_effort: "none"`이면 **1.0초**에 같은 답이 나온다(실측 2026-08-18).
 *
 * ⚠️ `max_tokens`로 줄이면 안 된다. 추론이 상한을 다 써서 `content`가 **빈 문자열**로
 * 오고 `finish_reason`이 `length`가 된다 — 빨라 보이지만 답이 없다. 한 번 속았다.
 *
 * ⚠️ `deepseek-v4-pro`는 13.5초에 **환각까지 했다** — 묻지도 않은 프린트·그래픽·
 * 레터링·자수를 제외 목록에 넣었다. 느리고 틀린 쪽을 고를 이유가 없다.
 */
const REASONING_EFFORT = "none";

interface SupabaseKeys {
  url: string;
  anonKey: string;
  serviceKey?: string;
}

function readSupabase(): SupabaseKeys | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey, serviceKey: process.env.SUPABASE_SECRET_KEY };
}

async function rpc(
  keys: SupabaseKeys,
  fn: string,
  body: Record<string, unknown>,
  useService: boolean,
): Promise<unknown> {
  const key = useService ? keys.serviceKey : keys.anonKey;
  if (!key) return null;
  const res = await fetch(`${keys.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return await res.json();
}

async function askLlm(query: string, model: string): Promise<QueryPlan | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  const base = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  if (!key) return null;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      // 같은 질의에 같은 해석이 나와야 캐시가 의미를 갖는다
      temperature: 0,
      reasoning_effort: REASONING_EFFORT,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INTERPRET_PROMPT },
        { role: "user", content: query },
      ],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content;
  if (text === undefined) return null;
  return parsePlan(text);
}

export async function POST(request: Request): Promise<NextResponse> {
  let query: string;
  try {
    const body = (await request.json()) as { query?: unknown };
    query = typeof body.query === "string" ? body.query.trim().slice(0, 200) : "";
  } catch {
    return NextResponse.json(emptyPlan());
  }
  // 키워드 질의는 LLM을 타지 않는다 (설계 S-02) — 규칙이 이미 잘 처리한다.
  if (query === "" || isKeywordQuery(query)) {
    return NextResponse.json(emptyPlan());
  }

  const keys = readSupabase();
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

  // ① 캐시. 없으면 null이고, 그때만 LLM을 부른다.
  if (keys) {
    try {
      const hit = await rpc(
        keys,
        "c_search_plan_get",
        { p_query: query, p_prompt_ver: PROMPT_VERSION, p_model: model },
        false,
      );
      if (hit !== null && typeof hit === "object") {
        return NextResponse.json({ ...emptyPlan(), ...hit, cached: true });
      }
    } catch {
      // 캐시 실패는 무시하고 LLM으로 간다 — 느려질 뿐 결과는 같다
    }
  }

  // ② LLM. 실패하면 빈 해석 — 검색은 그대로 돈다.
  let plan: QueryPlan | null = null;
  try {
    plan = await askLlm(query, model);
  } catch {
    plan = null;
  }
  if (plan === null) return NextResponse.json(emptyPlan());

  // ③ 캐시에 넣는다. **서비스 키가 있어야 한다** — 없으면 매번 LLM을 부르게 되고,
  //    그건 느리고 비쌀 뿐 틀리지는 않는다. 그래서 실패해도 응답은 그대로 준다.
  if (keys?.serviceKey !== undefined) {
    try {
      await rpc(
        keys,
        "c_search_plan_put",
        { p_query: query, p_prompt_ver: PROMPT_VERSION, p_model: model, p_plan: plan },
        true,
      );
    } catch {
      // 캐시 쓰기 실패는 무시한다
    }
  }

  return NextResponse.json({ ...plan, cached: false });
}
