// 온보딩에서 고른 옷 — 순수 타입과 규칙. 저장소·네트워크를 모른다.
//
// **계산된 장기 취향과 같은 데이터가 아니다**(정본). 사람이 명시적으로 고른 값이라
// 감쇠·상한 같은 앵커 규칙을 그대로 적용하지 않는다. 대신 아래 `seedAnchors`가
// **행동이 쌓이는 만큼 물러나는** 씨앗으로 바꿔 준다.

/** 화면이 최소 이만큼은 받아야 다음으로 간다. 서버도 같은 수로 거부한다. */
export const MIN_PICKS = 3;

export interface OnboardingPick {
  goodsNo: number;
  /** 화면에서 몇 번째 카드였나 (0부터). 죽은 후보를 빼고 그리므로 후보 순번과 다르다. */
  cardPos: number;
  /** 몇 번째로 골랐나 (0부터). */
  pickSeq: number;
}

export function canProceed(picks: readonly OnboardingPick[]): boolean {
  return picks.length >= MIN_PICKS;
}

/** 서버가 보낸 것을 그대로 믿지 않는다 — 형태가 어긋난 항목은 버린다. */
export function toPick(raw: unknown): OnboardingPick | null {
  if (typeof raw !== "object" || raw === null) return null;
  const {
    goods_no: goodsNo,
    card_pos: cardPos,
    pick_seq: pickSeq,
  } = raw as Record<string, unknown>;
  if (typeof goodsNo !== "number" || !Number.isInteger(goodsNo) || goodsNo <= 0)
    return null;
  if (typeof cardPos !== "number" || !Number.isInteger(cardPos) || cardPos < 0)
    return null;
  if (typeof pickSeq !== "number" || !Number.isInteger(pickSeq) || pickSeq < 0)
    return null;
  return { goodsNo, cardPos, pickSeq };
}

/**
 * 저장·전송용 형태. **서버 열 이름과 같은 snake_case 하나만 쓴다** —
 * 저장소·보관함·RPC가 형태를 따로 정하면 한 곳에서 쓰고 다른 곳에서 못 읽는다
 * (실제로 보관함이 camelCase로 쓰고 snake_case로 읽어 승계가 조용히 비었다).
 */
export function toWire(pick: OnboardingPick): {
  goods_no: number;
  card_pos: number;
  pick_seq: number;
} {
  return { goods_no: pick.goodsNo, card_pos: pick.cardPos, pick_seq: pick.pickSeq };
}

export function toPicks(raw: unknown): OnboardingPick[] {
  if (!Array.isArray(raw)) return [];
  const picks: OnboardingPick[] = [];
  for (const item of raw) {
    const pick = toPick(item);
    if (pick !== null) picks.push(pick);
  }
  return picks;
}

/** 고른 것을 담는 무게. 찜(4)과 같다 — 명시적으로 고른 것은 찜만큼 세다. */
export const SEED_WEIGHT = 4;

/**
 * 씨앗이 완전히 물러나는 실제 앵커 수.
 *
 * 고정 무게로 영원히 얹으면 온보딩 선택이 **평생 피드를 지배한다.** 처리방침은
 * 이것을 "첫 추천의 **시작점**"이라고 약속했지 종착점이라고 하지 않았다.
 * 20은 튜닝 상수다 — 근거는 실측이 아니라 "행동 스무 번이면 그 사람 것이 더 낫다"는
 * 판단이다. 바꾸려면 이 상수만 만지면 된다.
 */
export const SEED_FADE_ANCHORS = 20;

/**
 * 온보딩 선택을 추천 요청에 실을 앵커로 바꾼다.
 *
 * 실제 행동 앵커가 쌓일수록 무게가 선형으로 줄고, `SEED_FADE_ANCHORS`에 닿으면
 * 빈 배열이 된다. **저장된 선택 자체는 건드리지 않는다** — 계정에 그대로 남아 있고,
 * 개인화를 초기화하면 다시 씨앗으로 돌아온다.
 */
export function seedAnchors(
  picks: readonly OnboardingPick[],
  realAnchorCount: number,
): { goodsNo: number; weight: number }[] {
  if (picks.length === 0) return [];
  const remaining = Math.max(0, 1 - realAnchorCount / SEED_FADE_ANCHORS);
  if (remaining === 0) return [];
  const weight = Math.round(SEED_WEIGHT * remaining * 100) / 100;
  if (weight <= 0) return [];
  return picks.map((pick) => ({ goodsNo: pick.goodsNo, weight }));
}
