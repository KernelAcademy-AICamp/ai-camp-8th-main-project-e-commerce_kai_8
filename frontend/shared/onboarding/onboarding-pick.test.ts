import { describe, expect, it } from "vitest";

import {
  canProceed,
  MIN_PICKS,
  type OnboardingPick,
  SEED_FADE_ANCHORS,
  SEED_WEIGHT,
  seedAnchors,
  toPicks,
} from "./onboarding-pick";

function pick(goodsNo: number, seq = 0): OnboardingPick {
  return { goodsNo, cardPos: seq, pickSeq: seq };
}

describe("canProceed", () => {
  it("최소 개수 미만이면 못 간다", () => {
    expect(canProceed([])).toBe(false);
    expect(canProceed([pick(1), pick(2, 1)])).toBe(false);
  });

  it("최소 개수부터는 간다 — 상한은 없다", () => {
    expect(canProceed([pick(1), pick(2, 1), pick(3, 2)])).toBe(true);
    const twelve = Array.from({ length: 12 }, (_, i) => pick(i + 1, i));
    expect(canProceed(twelve)).toBe(true);
  });

  it("최소 개수는 3이다 — 서버도 같은 수로 거부한다", () => {
    expect(MIN_PICKS).toBe(3);
  });
});

describe("toPicks", () => {
  it("서버가 보낸 것을 그대로 믿지 않는다", () => {
    expect(
      toPicks([
        { goods_no: 10, card_pos: 0, pick_seq: 0 },
        { goods_no: "열", card_pos: 1, pick_seq: 1 },
        { goods_no: 12, card_pos: -1, pick_seq: 2 },
        null,
        { goods_no: 13, card_pos: 3, pick_seq: 3 },
      ]),
    ).toEqual([
      { goodsNo: 10, cardPos: 0, pickSeq: 0 },
      { goodsNo: 13, cardPos: 3, pickSeq: 3 },
    ]);
  });

  it("배열이 아니면 빈 목록이다", () => {
    expect(toPicks(null)).toEqual([]);
    expect(toPicks({ goods_no: 1 })).toEqual([]);
  });
});

describe("seedAnchors", () => {
  const three = [pick(1), pick(2, 1), pick(3, 2)];

  it("행동이 없으면 온전한 무게로 실린다", () => {
    expect(seedAnchors(three, 0)).toEqual([
      { goodsNo: 1, weight: SEED_WEIGHT },
      { goodsNo: 2, weight: SEED_WEIGHT },
      { goodsNo: 3, weight: SEED_WEIGHT },
    ]);
  });

  it("행동이 쌓일수록 물러난다", () => {
    const half = seedAnchors(three, SEED_FADE_ANCHORS / 2);
    expect(half[0].weight).toBeCloseTo(SEED_WEIGHT / 2, 5);
    expect(half[0].weight).toBeLessThan(SEED_WEIGHT);
  });

  it("충분히 쌓이면 완전히 사라진다 — 첫 추천의 시작점이지 종착점이 아니다", () => {
    expect(seedAnchors(three, SEED_FADE_ANCHORS)).toEqual([]);
    expect(seedAnchors(three, SEED_FADE_ANCHORS + 50)).toEqual([]);
  });

  it("고른 것이 없으면 아무것도 싣지 않는다", () => {
    expect(seedAnchors([], 0)).toEqual([]);
  });
});
