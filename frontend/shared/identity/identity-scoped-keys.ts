// 신원이 바뀔 때 지울 저장소 키를 고른다 — 순수 규칙.
//
// **지울 것을 열거하지 않고 남길 것을 열거한다.** 새로 생기는 개인화 키가
// 자동으로 지워지는 쪽이 안전하다 — 빠뜨리면 앞사람의 취향이 새지만,
// 반대로 실수하면 편의가 줄 뿐이다.

// ⚠️ **두 가지 이름꼴이 섞여 있다.** 대부분 `atee-`지만 뒤에 붙은 몇몇은 `atee.`다.
// 하이픈만 보면 `atee.recent-products` 같은 것이 그물에 걸리지 않아, 로그아웃해도
// 앞사람이 본 상품이 다음 사람에게 그대로 보인다 — 실제로 그랬다(2026-08-22).
const PREFIXES = ["atee-", "atee."];

/** 기기에 매인 것 — 신원이 바뀌어도 유지한다 (설계 §2: 기기 ID를 회전하지 않는다) */
const KEEP_EXACT = new Set([
  "atee-device-id", // 기기 가명 식별자
  "atee-signal-queue", // 미전송 행동 이벤트 — 기기 것이므로 그대로 보낸다
  "atee-pending-forget", // 서버 삭제 재시도 대기 — 지우면 삭제 약속이 깨진다
  // 계정 취향 삭제 재시도 대기. 로그아웃하면 신원 전환 정리가 곧바로 도는데,
  // 여기서 같이 지우면 **다시 로그인해도 서버에 남은 취향을 지울 수 없다.**
  "atee-pending-taste-forget",
  // 탈퇴 대기 표식. 탈퇴하면 세션이 사라지면서 신원 전환 정리가 곧바로 도는데,
  // 여기서 같이 지우면 "삭제가 서버에 닿았는지" 확인할 손잡이를 잃는다.
  "atee-pending-account-delete",
  // 계정으로 옮길 찜 보관함. 정리 **직전에** 여기로 빼두므로, 같이 지우면
  // 옮길 것이 사라진다 (shared/identity/wish-carry.ts).
  "atee-wishlist-migrate",
  // 계정으로 옮길 성별 보관함. 찜과 같은 이유다 — 정리 직전에 빼두므로 같이 지우면
  // 비회원이 고른 성별이 사라져 로그인 직후 다시 묻게 된다
  // (shared/identity/gender-carry.ts). **설정 본체(atee-gender)는 여기 넣지 않는다**
  // — 앞 사용자의 성별이 다음 사용자에게 새면 안 되므로 지워지는 것이 맞다.
  "atee-gender-migrate",
]);

/** 버전이 붙는 키들 */
const KEEP_PREFIX = [
  // "atee-consent-notice-seen"은 고지 배너와 함께 없어졌다(2026-08-19) —
  // 옛 방문자의 잔여 키는 전환 때 함께 지워진다.
  "atee-identity", // 전환 표식 자체
];

export function identityScopedKeys(allKeys: readonly string[]): string[] {
  return allKeys.filter(
    (key) =>
      PREFIXES.some((prefix) => key.startsWith(prefix)) &&
      !KEEP_EXACT.has(key) &&
      !KEEP_PREFIX.some((prefix) => key.startsWith(prefix)),
  );
}

/**
 * 개인화 초기화에서 남길 것 — **취향이 아니라 설정과 소유물이다.**
 *
 * 방침 문구와 짝이다: "보여줄 상품의 성별은 초기화로 지워지지 않습니다",
 * "계정과 계정에 담긴 찜은 남습니다". 문구를 바꾸지 않고 여기만 바꾸면 거짓말이
 * 된다.
 */
const KEEP_ON_RESET = new Set(["atee-gender", "atee-wishlist"]);

/**
 * 개인화 데이터 초기화에서 지울 키.
 *
 * 신원 전환과 **같은 그물**을 쓴다 — 새로 생기는 개인화 키를 두 곳에 각각 적으면
 * 한쪽이 반드시 낡는다. 실제로 그랬다: 초기화는 키 셋만 지우고 있어서 최근 본
 * 제품·앵커 제목·피드 씨앗이 그대로 남았다(2026-08-22 제품 책임자).
 *
 * 기기 ID와 미전송 큐는 신원 전환에서는 남지만 초기화에서는 지운다 — 새 익명
 * ID로 처음부터 시작하기 때문이다. 그 둘은 부르는 쪽이 따로 지운다.
 */
export function personalizationScopedKeys(allKeys: readonly string[]): string[] {
  return identityScopedKeys(allKeys).filter((key) => !KEEP_ON_RESET.has(key));
}
