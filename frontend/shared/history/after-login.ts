"use client";

/**
 * 로그인을 마치고 **돌아갈 자리**.
 *
 * 구글 로그인은 외부 사이트로 완전히 나갔다 오는 이동이라, 화면 상태가 통째로
 * 사라진다. 콜백 주소에 값을 덧붙일 수도 없다 — 그 주소는 허용 목록에 등록된
 * 것과 **정확히 같아야** 한다(구글 로그인 설계 §3). 그래서 떠나기 전에 이 탭에
 * 적어 두고, 돌아온 뒤 그 자리로 옮긴다.
 *
 * 탭을 닫으면 사라진다(sessionStorage). 다른 탭에는 영향이 없다.
 */
const KEY = "atee.after-login";

/** 로그인을 시작하기 전에 부른다 */
export function rememberAfterLogin(path: string): void {
  try {
    if (path.startsWith("/") && !path.startsWith("//")) {
      sessionStorage.setItem(KEY, path);
    }
  } catch {
    // 저장소를 못 쓰면 기본 자리로 돌아간다
  }
}

/** 돌아온 뒤 한 번만 읽는다 — 읽으면 지운다 */
export function takeAfterLogin(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    // 로그인 화면 자신으로 되돌아가지 않는다
    return path !== null && path.startsWith("/") && !path.startsWith("/login")
      ? path
      : null;
  } catch {
    return null;
  }
}
