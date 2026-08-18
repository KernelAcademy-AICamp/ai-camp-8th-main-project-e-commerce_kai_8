// 인증 세션의 순수 규칙 — React·Next·네트워크에 의존하지 않는다.
// 설계: docs/superpowers/specs/2026-08-18-google-login-design.md §2·§3

/** 로그인한 사용자. 이 조각에서 화면에 쓰는 것은 이메일뿐이다(설계 §3 YAGNI). */
export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * 화면이 구분해야 하는 세 상태.
 * 판정 전(loading)을 따로 두어야 로그아웃 화면이 먼저 보였다가
 * 로그인 화면으로 튀는 깜빡임이 생기지 않는다(설계 §3 화면).
 */
export type AuthState =
  { kind: "loading" } | { kind: "signedOut" } | { kind: "signedIn"; user: AuthUser };

/** 구글에서 돌아온 주소에 실려 오는 것 — 취소와 실패를 구분한다(설계 §3 경계 조건). */
export type CallbackParams =
  { kind: "code"; code: string } | { kind: "cancelled" } | { kind: "failed" };

/**
 * 콜백 주소의 질의 문자열을 읽는다.
 * 동의 화면에서 "취소"를 누르면 access_denied가 오는데, 이건 오류가 아니라
 * 사용자의 선택이므로 실패와 다르게 다룬다.
 */
export function readCallbackParams(search: URLSearchParams): CallbackParams {
  const error = search.get("error");
  if (error !== null) {
    return error === "access_denied" ? { kind: "cancelled" } : { kind: "failed" };
  }
  const code = search.get("code");
  if (code !== null && code !== "") return { kind: "code", code };
  return { kind: "failed" };
}

/** 설정 화면에 남길 표시. 취소는 조용히 돌아간다 — 아무 표시도 남기지 않는다. */
export type AuthNotice = "failed";

/** 질의 문자열의 표시값을 읽는다. 모르는 값은 표시 없음으로 본다. */
export function readAuthNotice(value: string | null | undefined): AuthNotice | null {
  return value === "failed" ? "failed" : null;
}
