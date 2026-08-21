// FOR YOU에 어떤 큐레이션을 몇 번 보여줬는지 센다 — 점수를 깎을 재료.
//
// 없으면 취향이 굳은 사람에게 **매번 똑같은 6장**이 나온다. BROWSE 피드가 같은
// 문제를 자기강화 보정(profile-rules의 IMPRESSION_DAMPING)으로 푸는데, 판정 규칙은
// features/curation/domain/curation-match가 그 공식을 그대로 쓴다. 여기는 재료만 만든다.
//
// shared에 있는 이유는 anchor-titles와 같다 — "개인화 데이터 초기화"(profile-store)가
// 이것도 지워야 하는데, shared는 feature를 import할 수 없어서다.

import { DECAY_PER_SESSION } from "./profile-rules";

const CACHE_KEY = "atee-curation-views";

/** 이보다 옅어진 기록은 버린다 (bounded summary 원칙 — profile-rules) */
const FADE_FLOOR = 0.01;

/** 큐레이션 키 → 보여준 횟수. 큐레이션은 57개뿐이라 상한을 두지 않는다. */
export type CurationViews = Record<string, number | undefined>;

export function readCurationViews(): CurationViews {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as CurationViews)
      : {};
  } catch {
    return {};
  }
}

/**
 * 이번에 보여준 큐레이션의 횟수를 올린다. **먼저 지난 기록을 흐린다** — 장기 앵커와
 * 같은 감쇠(DECAY_PER_SESSION)다.
 *
 * 감쇠가 없으면 횟수가 무한히 쌓여, 한때 자주 보여준 큐레이션은 아무리 취향에 맞아도
 * 다시 첫 화면에 못 올라온다. 흐리면 계속 뽑히는 것도 10회 언저리에서 멈추고(깎임 최대
 * 0.25배), 한동안 안 보여준 것은 저절로 회복된다 — 자리가 돌고 도는 균형이 된다.
 */
export function recordCurationViews(keys: string[]): void {
  if (keys.length === 0) return;
  const views: CurationViews = {};
  for (const [key, count] of Object.entries(readCurationViews())) {
    const faded = Math.round((count ?? 0) * DECAY_PER_SESSION * 1000) / 1000;
    if (faded > FADE_FLOOR) views[key] = faded;
  }
  for (const key of keys) views[key] = (views[key] ?? 0) + 1;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(views));
  } catch {
    // 저장 불가 — 깎기 없이 동작한다 (순서가 고정될 뿐 화면은 멀쩡하다)
  }
}

export function clearCurationViews(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // 저장소 접근 불가면 지울 것도 없다
  }
}
