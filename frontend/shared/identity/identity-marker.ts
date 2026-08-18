// 신원 전환 판정 — 순수 규칙.
// 설계: docs/superpowers/specs/2026-08-18-google-login-design.md §2 신원 전환

/** 로그인하지 않은 상태를 나타내는 표식 */
export const ANONYMOUS = "anon";

/**
 * 표식은 **사용자 식별자 원문**을 쓴다.
 * 파생값으로 바꿔도 보호가 늘지 않는다 — 같은 브라우저에 이미 세션 쿠키가
 * 있어 로그인 사용자를 알 수 있다. 대신 "기기에 신원 표식이 남는다"는 사실을
 * 고지에 적는다(설계 §3 고지).
 */
export function markerFor(userId: string | null): string {
  return userId ?? ANONYMOUS;
}

/**
 * 전환인가?
 *
 * 처리 이력이 없으면(previous === null) 전환이 아니다 — 새 탭에는 지울 이전
 * 상태가 없다. 같은 표식이 다시 와도 전환이 아니다 — 최초 세션 복원·토큰
 * 갱신·중복 로그인 이벤트가 여기 해당한다(설계 §2: 세 가지 전환만 처리).
 */
export function isIdentityTransition(
  previous: string | null,
  current: string,
): boolean {
  return previous !== null && previous !== current;
}
