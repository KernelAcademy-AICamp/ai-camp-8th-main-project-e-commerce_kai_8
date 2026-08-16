import { getDeviceId } from "@/shared/signals/device-id";
import { MODEL_VER } from "@/shared/signals/types";
import { rpcPost } from "@/shared/supabase-rpc";

/**
 * 검색어 기록 (검색 0단계 계획 1단계 · 방침 O-32).
 *
 * 행동 신호(c_events)와 **다른 저장소·다른 RPC**를 쓴다. 추천 프로필 계산 경로에
 * 섞이면 피드 지표가 오염되기 때문이다(설계 §10). 배치 큐도 쓰지 않는다 —
 * 검색은 노출과 달리 드물게 일어나 한 건씩 보내도 요청 수가 문제되지 않는다.
 *
 * 실패해도 조용히 넘어간다. 계측이 검색 경험을 막아서는 안 된다.
 */
const LOG_TIMEOUT_MS = 5_000;

export interface SearchLogInput {
  /** 사용자가 친 원문 (서버가 200자로 자른다) */
  queryRaw: string;
  /** 프론트·서버 공통 정규화를 거친 질의 */
  queryNorm: string;
  /** ⚠️ 첫 페이지 건수. 전체 매치 수가 아니다 (현재 RPC가 총계를 주지 않는다) */
  resultCount: number | null;
  /** 비활성 30분 경계 세션 ID (O-29) */
  sessionId: string;
}

export async function postSearchLog(input: SearchLogInput): Promise<void> {
  await rpcPost<number>(
    "c_log_search",
    {
      p_device: getDeviceId(),
      p_logs: [
        {
          log_id: crypto.randomUUID(),
          session_id: input.sessionId,
          query_raw: input.queryRaw,
          query_norm: input.queryNorm,
          result_count: input.resultCount,
          occurred_at: new Date().toISOString(),
          model_ver: MODEL_VER,
        },
      ],
    },
    { timeoutMs: LOG_TIMEOUT_MS },
  );
}

/** 화면 흐름을 막지 않는 발사 후 망각 호출 — 실패는 콘솔에만 남긴다 */
export function logSearch(input: SearchLogInput): void {
  void postSearchLog(input).catch((cause: unknown) => {
    console.error("검색어 기록 실패 — 무시하고 계속", cause);
  });
}
