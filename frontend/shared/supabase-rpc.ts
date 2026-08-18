// Supabase RPC 호출 공통부 — 피드·유사 검색·신호 기록이 공유한다.
// (feed-api에 있던 것을 여러 feature가 쓰게 되어 shared로 승격)

function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 환경변수가 필요합니다 (frontend/.env.example 참고)",
    );
  }
  return { url, key };
}

export async function rpcPost<T>(
  fn: string,
  body: Record<string, unknown>,
  options?: {
    /** 페이지 이탈 중에도 전송을 이어가는 fetch keepalive (이벤트 로그용) */
    keepalive?: boolean;
    /** 이 시간 안에 응답이 없으면 중단한다 — 폴백이 있는 호출용 (개인화 믹스 등) */
    timeoutMs?: number;
  },
): Promise<T> {
  const { url, key } = supabaseEnv();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: options?.keepalive ?? false,
    signal:
      options?.timeoutMs !== undefined && typeof AbortSignal !== "undefined"
        ? AbortSignal.timeout(options.timeoutMs)
        : undefined,
  });
  if (!res.ok) {
    throw new Error(`${fn} 실패: HTTP ${String(res.status)}`);
  }
  return (await res.json()) as T;
}

/** PostgREST 조회(GET) — RPC가 아닌 공개 뷰 단건 조회용 (query는 `뷰?필터` 형태) */
export async function restSelect<T>(query: string): Promise<T> {
  const { url, key } = supabaseEnv();
  const res = await fetch(`${url}/rest/v1/${query}`, { headers: { apikey: key } });
  if (!res.ok) {
    throw new Error(`${query} 조회 실패: HTTP ${String(res.status)}`);
  }
  return (await res.json()) as T;
}
