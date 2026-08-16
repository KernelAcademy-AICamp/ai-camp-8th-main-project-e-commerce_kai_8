// Supabase RPC 호출 공통부 — 피드·유사 검색·신호 기록이 공유한다.
// (feed-api에 있던 것을 여러 feature가 쓰게 되어 shared로 승격)

export async function rpcPost<T>(
  fn: string,
  body: Record<string, unknown>,
  options?: {
    /** 페이지 이탈 중에도 전송을 이어가는 fetch keepalive (이벤트 로그용) */
    keepalive?: boolean;
  },
): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 환경변수가 필요합니다 (frontend/.env.example 참고)",
    );
  }
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: options?.keepalive ?? false,
  });
  if (!res.ok) {
    throw new Error(`${fn} 실패: HTTP ${String(res.status)}`);
  }
  return (await res.json()) as T;
}
