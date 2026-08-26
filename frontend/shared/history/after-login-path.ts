// 로그인 뒤 돌아갈 자리 — 클라이언트(굽기)와 서버(읽고 되돌리기)가 함께 쓰는
// 순수 규칙. 프레임워크·쿠키 API에 의존하지 않는다.

export const AFTER_LOGIN_COOKIE = "atee-after-login";

/**
 * 되돌아갈 자리로 쓸 수 있는 값인가.
 *
 * 로그인 화면 자신으로는 돌아가지 않는다 — 로그인하자마자 다시 로그인 화면을
 * 보게 된다. 다른 출처로 새는 것을 막기 위해 반드시 이 오리진의 경로(`/`로
 * 시작)여야 한다.
 */
export function isReturnablePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/login");
}

/**
 * 콜백이 실제로 이동할 주소를 고른다.
 *
 * 쿠키가 없거나, 값이 되돌아갈 수 없는 경로거나, 이미 도착지인 `/my`면
 * 손대지 않는다 — 어차피 콜백의 기본 착지점이 `/my`다.
 */
export function resolveAfterLoginPath(rawCookie: string | undefined): string | null {
  if (rawCookie === undefined) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawCookie);
  } catch {
    return null;
  }
  if (!isReturnablePath(decoded) || decoded === "/my") return null;
  return decoded;
}
