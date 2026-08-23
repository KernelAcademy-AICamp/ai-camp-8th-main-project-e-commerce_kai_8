/**
 * 신원이 바뀐 뒤 이 탭이 **다시 뜰 자리**.
 *
 * 신원이 바뀌면 정리 장치(`use-identity-reconcile`)가 앞사람의 흔적을 지우고
 * 페이지를 다시 부른다. 기본값은 **보던 자리 그대로**다.
 *
 * 로그아웃처럼 보던 자리가 더는 유효하지 않은 경우에는 옮길 곳을 여기 적어
 * 둔다. **따로 이동시키지 않는 이유**: 정리 장치도 페이지를 다시 부르므로
 * 둘이 각자 움직이면 어느 쪽이 이길지 알 수 없다. 한 곳에서만 옮긴다.
 *
 * 모듈 변수에 둔다 — 한 탭의 한 번뿐인 부탁이고, 페이지가 다시 뜨면 사라져야
 * 한다. 저장소에 적으면 다음 전환까지 남아 엉뚱한 때에 옮긴다.
 */
let requested: string | null = null;

/** 다음 신원 전환에서 이 자리로 옮겨 달라고 부탁한다 */
export function requestIdentityLanding(path: string): void {
  requested = path;
}

/** 부탁받은 자리를 가져간다. 한 번 읽으면 지운다 — 다음 전환까지 남으면 안 된다. */
export function takeIdentityLanding(): string | null {
  const path = requested;
  requested = null;
  return path;
}
