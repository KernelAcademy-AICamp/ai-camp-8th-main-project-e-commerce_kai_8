// 신원이 바뀔 때 지울 저장소 키를 고른다 — 순수 규칙.
//
// **지울 것을 열거하지 않고 남길 것을 열거한다.** 새로 생기는 개인화 키가
// 자동으로 지워지는 쪽이 안전하다 — 빠뜨리면 앞사람의 취향이 새지만,
// 반대로 실수하면 편의가 줄 뿐이다.

const PREFIX = "atee-";

/** 기기에 매인 것 — 신원이 바뀌어도 유지한다 (설계 §2: 기기 ID를 회전하지 않는다) */
const KEEP_EXACT = new Set([
  "atee-device-id", // 기기 가명 식별자
  "atee-signal-queue", // 미전송 행동 이벤트 — 기기 것이므로 그대로 보낸다
  "atee-pending-forget", // 서버 삭제 재시도 대기 — 지우면 삭제 약속이 깨진다
  // 탈퇴 대기 표식. 탈퇴하면 세션이 사라지면서 신원 전환 정리가 곧바로 도는데,
  // 여기서 같이 지우면 "삭제가 서버에 닿았는지" 확인할 손잡이를 잃는다.
  "atee-pending-account-delete",
]);

/** 버전이 붙는 키들 */
const KEEP_PREFIX = [
  "atee-consent-notice-seen", // 고지 배너 확인 여부 — 신원이 아니라 기기 것
  "atee-identity", // 전환 표식 자체
];

export function identityScopedKeys(allKeys: readonly string[]): string[] {
  return allKeys.filter(
    (key) =>
      key.startsWith(PREFIX) &&
      !KEEP_EXACT.has(key) &&
      !KEEP_PREFIX.some((prefix) => key.startsWith(prefix)),
  );
}
