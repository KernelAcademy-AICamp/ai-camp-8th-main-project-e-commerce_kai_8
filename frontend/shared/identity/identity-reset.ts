// 신원 전환 시 이 탭의 신원 종속 데이터를 지운다.
//
// sessionStorage는 **탭마다 다르다** — 다른 탭이 지워도 이 탭 것은 남는다.
// 그래서 각 탭이 자기 것을 직접 지운다(설계 §2 다중 탭).

import { identityScopedKeys, personalizationScopedKeys } from "./identity-scoped-keys";

function clearFrom(
  storage: Storage,
  pick: (keys: readonly string[]) => string[],
): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  for (const key of pick(keys)) {
    storage.removeItem(key);
  }
}

/** 찜·취향 프로필·세션 프로필·신호 세션을 지운다. 기기 ID와 미전송 큐는 남긴다. */
export function clearIdentityScopedData(): void {
  try {
    clearFrom(localStorage, identityScopedKeys);
    clearFrom(sessionStorage, identityScopedKeys);
  } catch {
    // 저장소 접근 불가(프라이빗 모드 등) — 지울 것도 없다
  }
}

/**
 * 개인화 데이터 초기화 — 이 기기에 쌓인 탐색 흔적을 지운다.
 *
 * 취향 프로필뿐 아니라 **앵커 제목·최근 본 제품·피드 씨앗**까지 걷어낸다. 남으면
 * 지웠는데도 화면이 그대로라 "안 지워졌다"로 읽힌다.
 *
 * 성별 설정과 찜은 남긴다 — 방침 문구가 그렇게 약속한다.
 */
export function clearPersonalizationData(): void {
  try {
    clearFrom(localStorage, personalizationScopedKeys);
    clearFrom(sessionStorage, personalizationScopedKeys);
  } catch {
    // 저장소 접근 불가(프라이빗 모드 등) — 지울 것도 없다
  }
}
