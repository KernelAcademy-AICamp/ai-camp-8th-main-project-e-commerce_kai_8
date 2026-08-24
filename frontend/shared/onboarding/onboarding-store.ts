// 이 기기에 담아 두는 온보딩 상태 — 두 가지가 서로 다른 수명을 가진다.
//
// ① **고른 옷**(`atee-onboarding-picks`) — 신원 종속이다. 로그아웃·계정 전환에서
//    지워져야 앞사람이 고른 것이 다음 사람에게 새지 않는다(O-35). 그래서 정리
//    allowlist의 남길 목록에 **넣지 않는다.** 로그인으로 넘길 때는 성별·찜과 같이
//    별도 보관함을 거친다(shared/identity/onboarding-carry.ts).
//
// ② **이 기기에서 마친 적 있음**(`atee-onboarding-done`) — 기기에 매인 사실이다.
//    로그아웃해도 남아야 다음 방문이 로그인 화면부터 시작한다(§1-0). 그래서 남길
//    목록에 **넣는다.** 담는 것은 "마친 적이 있다"는 사실뿐이고 **누가·무엇을
//    골랐는지는 담지 않는다** — 그것까지 남기면 앞사람의 취향이 새어 O-35가 깨진다.
//
// useSyncExternalStore 계약을 지킨다 — 바뀌기 전까지 같은 값을 돌려준다.

import { type OnboardingPick, toPicks, toWire } from "./onboarding-pick";

export const PICKS_KEY = "atee-onboarding-picks";
export const DONE_KEY = "atee-onboarding-done";

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

export function subscribeOnboarding(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── ① 고른 옷 ───────────────────────────────────────────────────────────────

/**
 * 고른 것과 **그때 본 후보 판**을 한 덩어리로 담는다.
 *
 * 판을 따로 두면 둘이 어긋난다. 그리고 승계는 신원 전환 정리 직전에 저장소에서
 * 읽어 가는데, 그 자리에서 두 키를 맞춰 읽을 이유가 없다(교차 리뷰 ⑥).
 */
export interface StoredPicks {
  version: string;
  picks: OnboardingPick[];
}

const EMPTY_STORED: StoredPicks = { version: "", picks: [] };

let stored: StoredPicks = EMPTY_STORED;
let picksLoaded = false;

/** 저장된 문자열을 해석한다. 형태가 어긋나면 없는 것으로 본다. */
export function parseStoredPicks(raw: string | null): StoredPicks {
  if (raw === null) return EMPTY_STORED;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_STORED;
    const { version, picks } = parsed as Record<string, unknown>;
    if (typeof version !== "string" || version === "") return EMPTY_STORED;
    const list = toPicks(picks);
    if (list.length === 0) return EMPTY_STORED;
    return { version, picks: list };
  } catch {
    return EMPTY_STORED;
  }
}

function serialize(value: StoredPicks): string {
  return JSON.stringify({ version: value.version, picks: value.picks.map(toWire) });
}

/**
 * 지금 값. **첫 호출에서 저장소를 동기적으로 읽는다** — effect 뒤로 미루면 그 사이에
 * 피드 훅이 마운트 즉시 씨앗 없는 요청을 보내버린다(성별 설정과 같은 이유).
 */
function getStoredSnapshot(): StoredPicks {
  if (!picksLoaded) {
    try {
      stored = parseStoredPicks(localStorage.getItem(PICKS_KEY));
    } catch {
      stored = EMPTY_STORED;
    }
    picksLoaded = true;
  }
  return stored;
}

export function getPicksSnapshot(): readonly OnboardingPick[] {
  return getStoredSnapshot().picks;
}

export function setPicks(version: string, next: readonly OnboardingPick[]): void {
  stored = { version, picks: [...next] };
  picksLoaded = true;
  try {
    localStorage.setItem(PICKS_KEY, serialize(stored));
  } catch {
    // 저장은 실패해도 이번 세션 동안은 고른 대로 동작한다.
  }
  notify();
}

/** 메모리 캐시만 비운다 — 저장소는 건드리지 않는다. */
function clearPicksCache(): void {
  stored = EMPTY_STORED;
  picksLoaded = false;
  notify();
}

/** 개인화 초기화가 부른다 — 저장소까지 비운다. */
export function clearStoredPicks(): void {
  try {
    localStorage.removeItem(PICKS_KEY);
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
  clearPicksCache();
}

// ── ② 이 기기에서 마친 적 있음 ──────────────────────────────────────────────

let done: boolean | null = null;

export function getDoneSnapshot(): boolean {
  if (done === null) {
    try {
      done = localStorage.getItem(DONE_KEY) === "1";
    } catch {
      done = false;
    }
  }
  return done;
}

/** 서버 렌더에는 이 기기의 값이 없다 — 마친 적 없는 것으로 본다. */
export function getDoneServerSnapshot(): boolean {
  return false;
}

/** 온보딩이 계정에 저장된 것을 확인한 뒤에만 부른다. */
export function markDone(): void {
  if (done === true) return;
  done = true;
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    // 못 남기면 다음 방문이 온보딩 1단계부터 시작한다 — 막다른 길은 아니다.
  }
  notify();
}

/** 테스트용 — 모듈 상태를 처음으로 되돌린다. */
export function resetOnboardingStore(): void {
  stored = EMPTY_STORED;
  picksLoaded = false;
  done = null;
  notify();
}
