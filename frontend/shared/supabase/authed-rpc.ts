// 계정 데이터용 **인증 통로**.
//
// `shared/supabase-rpc.ts`(공개 카탈로그·기기 신호용 익명 통로)와 **일부러
// 분리한다.** 익명 통로는 공개 키만 실어 보내므로 로그인 사용자로 판정되지 않고,
// 계정 전용 함수를 부를 수 없다. 조각 1 설계 §2 transport 경계 계약:
// 기존 익명 호출 경로를 전역으로 갈아끼우지 않는다.
//
// 여기서도 **Supabase 클라이언트 자체를 내보내지 않는다.** 이름 붙은 호출 하나만
// 내보내, feature가 세션·쿠키를 직접 만지지 못하게 한다.

import { getBrowserSupabase } from "@/shared/supabase/browser-client";

/**
 * 서버가 이유를 구분해 알려준 오류.
 *
 * 예: 찜 상한 초과는 `54000`으로 온다. 호출자가 "네트워크 문제"와
 * "규칙에 걸렸다"를 구분해 다른 문구를 보여줄 수 있어야 한다.
 */
export class AuthedRpcError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "AuthedRpcError";
    this.code = code;
  }
}

/**
 * 로그인한 사용자로 서버 함수를 부른다.
 *
 * @throws {AuthedRpcError} 서버가 거부했거나 응답을 해석할 수 없을 때
 */
export async function authedRpc<T>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  // 스키마 타입을 붙이지 않아 결과가 any로 온다. 여기서 한 번 좁힌다.
  const response = (await getBrowserSupabase().rpc(fn, args)) as {
    data: unknown;
    error: { message: string; code?: string } | null;
  };
  if (response.error !== null) {
    throw new AuthedRpcError(response.error.message, response.error.code ?? null);
  }
  return response.data as T;
}
