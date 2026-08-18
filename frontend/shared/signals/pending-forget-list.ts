// 미완료 삭제 재시도 목록의 규칙 — 순수 함수.
//
// **상한을 두지 않는다.** 예전에는 20개를 넘으면 오래된 것부터 조용히 버렸는데,
// 버려진 기기 ID의 서버 기록은 **다시는 지울 수 없다** — 그 ID를 아는 유일한
// 곳이 이 목록이기 때문이다. 설정 화면과 방침 문서가 약속한 "다음 접속에서
// 다시 시도"가 그 순간 거짓이 된다 (설계 §4-1의 두 번째 결함).
//
// 무한히 자라지 않느냐는 걱정은 실물과 맞지 않는다. 항목이 늘어나려면
// **사용자가 삭제를 요청하고 그 요청이 서버에서 실패해야** 하고, 성공하면 즉시
// 빠진다. 항목 하나는 36자짜리 식별자다.

/** 실패한 기기 ID를 목록에 더한다. 이미 있으면 그대로 둔다. */
export function nextPendingForgetList(
  current: readonly string[],
  deviceId: string,
): string[] {
  if (current.includes(deviceId)) return [...current];
  return [...current, deviceId];
}
