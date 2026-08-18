// 인증 세션의 순수 규칙 — React·Next·네트워크에 의존하지 않는다.
// 설계: docs/superpowers/specs/2026-08-18-google-login-design.md §2·§3

/**
 * 로그인한 사용자.
 *
 * 화면에 쓰는 것은 이메일뿐이지만(설계 §3 YAGNI), `providerId`는 화면이 아니라
 * **탈퇴 안전장치**가 쓴다 — 삭제 응답이 유실됐을 때 "같은 구글 계정인가"를
 * 판정하는 유일한 기준이다(설계 §4).
 */
export interface AuthUser {
  id: string;
  email: string | null;
  /** 구글이 준 고유 식별자. 확보하지 못했으면 null */
  providerId: string | null;
}

/** 인증 서버가 알려주는 연결된 신원 중 이 판정에 필요한 부분만 */
export interface ProviderIdentity {
  provider: string;
  id: string;
}

/**
 * 구글이 준 고유 식별자를 고른다.
 *
 * 빈 문자열은 없는 것으로 본다 — 빈 값끼리 비교하면 서로 다른 사람을 같은
 * 사람으로 판정한다.
 */
export function googleProviderId(
  identities: readonly ProviderIdentity[] | null | undefined,
): string | null {
  const google = identities?.find((identity) => identity.provider === "google");
  if (google === undefined || google.id === "") return null;
  return google.id;
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

/**
 * 설정 화면에 남길 표시. 취소는 조용히 돌아간다 — 아무 표시도 남기지 않는다.
 *
 * `deleted`는 탈퇴가 **확인된** 경우에만 붙인다. 응답이 불명확했으면 붙이지
 * 않는다 — 지워지지 않았는데 지워진 줄 아는 것이 가장 나쁜 결과다(설계 §4).
 */
export type AuthNotice = "failed" | "deleted" | "delete-unverified";

const NOTICES: readonly AuthNotice[] = ["failed", "deleted", "delete-unverified"];

/** 질의 문자열의 표시값을 읽는다. 모르는 값은 표시 없음으로 본다. */
export function readAuthNotice(value: string | null | undefined): AuthNotice | null {
  return NOTICES.find((notice) => notice === value) ?? null;
}
