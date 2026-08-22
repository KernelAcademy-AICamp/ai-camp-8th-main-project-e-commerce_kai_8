// RPC 실패를 **종류로 나눈다.** 지금까지는 전부 같은 오류였고, 부르는 쪽은 실패하면
// 무조건 폴백하고 무조건 다시 시도했다. 성별 인자가 필수가 되면서 그 방식이 위험해졌다 —
// 잘못된 인자로 거부당하면 폴백도 같은 인자로 거부당하고, 그 실패가 다시 무한 재시도로
// 들어가 스켈레톤에서 영영 못 벗어난다 (계획 6단계).

/**
 * - `contract` — 인자·시그니처가 틀렸다(400·404·422 등). **고치기 전에는 몇 번을 해도
 *   똑같다.** 폴백도 재시도도 하지 않고 드러낸다. 표에 없는 나머지 4xx도 여기로 본다
 *   (분류기가 놓쳐 구현마다 동작이 갈리는 것을 막는 기본값).
 * - `auth` — 인증·권한(401·403). 역시 반복해도 같다.
 * - `throttle` — 일시 제한(408·429). **잠시 뒤에는 된다** — 간격을 늘려 다시 시도한다.
 *   4xx를 한 덩어리로 묶으면 이것이 영구 오류가 되어 서버가 회복해도 못 돌아온다.
 * - `transient` — 서버 오류·네트워크·시간 초과. 폴백하고 상한 안에서 재시도한다.
 */
export type RpcErrorKind = "contract" | "auth" | "throttle" | "transient";

export class RpcError extends Error {
  readonly kind: RpcErrorKind;
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "RpcError";
    this.status = status;
    this.kind = classifyStatus(status);
  }
}

function classifyStatus(status: number | null): RpcErrorKind {
  if (status === null) return "transient"; // 네트워크·중단 — 응답 자체가 없었다
  if (status === 408 || status === 429) return "throttle";
  if (status === 401 || status === 403) return "auth";
  if (status >= 400 && status < 500) return "contract";
  return "transient";
}

/**
 * 인증 통로(`authedRpc`)는 HTTP 상태 대신 **PostgreSQL 오류 코드**를 준다. 그것도
 * 종류로 옮긴다 — 안 옮기면 인증 만료·권한 거부·계약 위반이 전부 "일시적 실패"가 되어,
 * 낙관적으로 바꾼 화면 값이 서버와 갈린 채 남는다(교차 리뷰 지적).
 *
 * `22023`(잘못된 인자)·`23xxx`(제약 위반)·`42xxx`(문법·권한)은 다시 해도 같다.
 * `28000`(인증 아님)은 권한 문제다.
 */
function kindFromPgCode(code: string): RpcErrorKind {
  if (code === "28000" || code.startsWith("42")) return "auth";
  if (code === "22023" || code.startsWith("23") || code.startsWith("22"))
    return "contract";
  return "transient";
}

export function rpcErrorKind(error: unknown): RpcErrorKind {
  if (error instanceof RpcError) return error.kind;
  // 인증 통로의 오류. 순환 import를 피하려고 형태로 판별한다.
  if (
    error !== null &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "AuthedRpcError"
  ) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? kindFromPgCode(code) : "transient";
  }
  return "transient";
}

/** 다시 시도해서 달라질 수 있는가 */
export function isRetryable(error: unknown): boolean {
  const kind = rpcErrorKind(error);
  return kind === "transient" || kind === "throttle";
}

/**
 * 다른 경로로 대신 시도해도 되는가.
 *
 * 계약 오류·권한 오류는 **폴백해도 같은 이유로 실패한다** — 개인화가 잘못된 인자로
 * 거부됐다면 무작위 피드도 같은 인자로 거부된다. 헛되이 한 번 더 부르고 오류를 늦게
 * 보여줄 뿐이다.
 */
export function isFallbackable(error: unknown): boolean {
  return isRetryable(error);
}
