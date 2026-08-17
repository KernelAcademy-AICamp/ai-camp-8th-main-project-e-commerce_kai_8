import { searchVersion } from "@/features/feed/search/data/search-api";
import { getDeviceId } from "@/shared/signals/device-id";
import { rpcPost } from "@/shared/supabase-rpc";

// 검색 알고리즘 버전은 **실제 실행된 경로**에서 가져온다(search-api).
// 상수로 박아두면 v2가 도는데 로그는 v1로 남아 전환 전후 비교가 통째로
// 오염된다 — 실제로 그 상태였다(구현 리뷰 M9).

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

/**
 * 로그에 싣기 전에 원문을 자르는 길이.
 *
 * 서버가 200자로 잘라 저장하지만, **자르기 전에** 요청 전체가 16KB를 넘으면
 * 통째로 거부한다. 검색 입력에는 길이 제한이 없어서 긴 붙여넣기가 들어오면
 * 검색은 정상인데 **로그만 조용히 사라진다**(교차 리뷰 M4). 보낼 이유가 없는
 * 나머지를 여기서 버린다.
 */
const RAW_QUERY_LIMIT = 200;

export interface SearchLogInput {
  /** 제출마다 하나. 실패 후 재시도 때 같은 값을 보내면 결과 수만 보정된다 */
  logId: string;
  /** 사용자가 친 원문 (보내기 전에 200자로 자른다 — 서버도 같은 길이로 저장한다) */
  queryRaw: string;
  /** 프론트·서버 공통 정규화를 거친 질의 */
  queryNorm: string;
  /** ⚠️ 첫 페이지 건수. 전체 매치 수가 아니다 (현재 RPC가 총계를 주지 않는다) */
  resultCount: number | null;
  /** 비활성 30분 경계 세션 ID (O-29) — **제출 시점**에 잡은 값 */
  sessionId: string;
  /** **제출 시각** (응답 시각이 아니다) */
  occurredAt: string;
  /**
   * 실제 검색에 쓰인 질의. 한영 자판 폴백이 걸리면 정규화 질의와 다르다 —
   * 무엇으로 찾았는지 모르면 로그로 원인을 되짚을 수 없다(구현 리뷰 M9).
   */
  queryUsed: string;
  /**
   * 이 검색에서 취향 피드를 이어 보여줬는가.
   *
   * 검색 **직후에는 모른다** — 0건인지, 매칭을 다 소진했는지는 나중에 정해진다.
   * 그래서 같은 log_id로 한 번 더 보내 보정한다. 서버는 **참으로만** 덮어쓴다.
   * 생략 = 아직 모름.
   */
  replacementShown?: boolean;
}

export async function postSearchLog(input: SearchLogInput): Promise<void> {
  await rpcPost<number>(
    "c_log_search",
    {
      p_device: getDeviceId(),
      p_logs: [
        {
          log_id: input.logId,
          session_id: input.sessionId,
          query_raw: input.queryRaw.slice(0, RAW_QUERY_LIMIT),
          query_norm: input.queryNorm,
          replacement_shown: input.replacementShown,
          result_count: input.resultCount,
          occurred_at: input.occurredAt,
          query_used: input.queryUsed,
          model_ver: searchVersion(),
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
