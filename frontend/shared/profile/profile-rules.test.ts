import { describe, expect, it } from "vitest";

import {
  applyAction,
  applyImpression,
  DECAY_PER_SESSION,
  emptyLongTerm,
  emptySession,
  foldSessionIntoLongTerm,
  IMPRESSION_COUNT_MAX,
  LONG_ANCHOR_MAX,
  mergeLongTerm,
  RECENT_IMPRESSIONS_MAX,
  SESSION_ANCHOR_MAX,
  SIGNAL_WEIGHTS,
} from "./profile-rules";

const NOW = 1_000_000;

describe("applyAction (세션 앵커 가중)", () => {
  it("신호 가중 서열: 탭 < 스타일 탐색 < 찜 < 판매처 이동 (PRD)", () => {
    expect(SIGNAL_WEIGHTS.tap).toBeLessThan(SIGNAL_WEIGHTS.style_explore);
    expect(SIGNAL_WEIGHTS.style_explore).toBeLessThan(SIGNAL_WEIGHTS.wish);
    expect(SIGNAL_WEIGHTS.wish).toBeLessThan(SIGNAL_WEIGHTS.outbound);
  });

  it("행동은 세션 앵커의 가중치를 올린다", () => {
    let session = emptySession("s1");
    session = applyAction(session, { type: "tap", goodsNo: 7, nowMs: NOW });
    session = applyAction(session, { type: "wish", goodsNo: 7, nowMs: NOW });
    const anchor = session.anchors.find((a) => a.goodsNo === 7);
    expect(anchor?.weight).toBeCloseTo(SIGNAL_WEIGHTS.tap + SIGNAL_WEIGHTS.wish);
  });

  it("찜 해제는 앵커를 제거한다", () => {
    let session = emptySession("s1");
    session = applyAction(session, { type: "wish", goodsNo: 7, nowMs: NOW });
    session = applyAction(session, { type: "unwish", goodsNo: 7, nowMs: NOW });
    expect(session.anchors.find((a) => a.goodsNo === 7)).toBeUndefined();
  });

  it("많이 노출된 상품의 행동은 가중을 덜 받는다 (자기강화 방지)", () => {
    let plain = emptySession("s1");
    plain = applyAction(plain, { type: "tap", goodsNo: 1, nowMs: NOW });

    let seen = emptySession("s2");
    for (let i = 0; i < 10; i += 1) seen = applyImpression(seen, 1);
    seen = applyAction(seen, { type: "tap", goodsNo: 1, nowMs: NOW });

    const plainWeight = plain.anchors[0].weight;
    const seenWeight = seen.anchors[0].weight;
    expect(seenWeight).toBeLessThan(plainWeight);
    expect(seenWeight).toBeGreaterThan(0);
  });

  it("세션 앵커가 상한을 넘으면 가중치 최저부터 가지치기한다", () => {
    let session = emptySession("s1");
    // 탭(약한 신호) 15개 + 찜(강한 신호) 10개 = 25개 → 상한 20
    for (let n = 1; n <= 15; n += 1) {
      session = applyAction(session, { type: "tap", goodsNo: n, nowMs: NOW });
    }
    for (let n = 16; n <= 25; n += 1) {
      session = applyAction(session, { type: "wish", goodsNo: n, nowMs: NOW });
    }
    expect(session.anchors).toHaveLength(SESSION_ANCHOR_MAX);
    // 강한 찜 앵커는 전부 남고, 약한 탭 앵커만 밀려난다
    for (let n = 16; n <= 25; n += 1) {
      expect(session.anchors.some((a) => a.goodsNo === n)).toBe(true);
    }
    const tapAnchors = session.anchors.filter((a) => a.goodsNo <= 15);
    expect(tapAnchors).toHaveLength(SESSION_ANCHOR_MAX - 10);
  });
});

describe("applyImpression (계측 보조 상태)", () => {
  it("노출 횟수와 최근 노출 목록을 상한 안에서 유지한다", () => {
    let session = emptySession("s1");
    for (let n = 0; n < RECENT_IMPRESSIONS_MAX + 50; n += 1) {
      session = applyImpression(session, n);
    }
    expect(session.recentImpressions.length).toBeLessThanOrEqual(
      RECENT_IMPRESSIONS_MAX,
    );
    expect(Object.keys(session.impressionCounts).length).toBeLessThanOrEqual(
      IMPRESSION_COUNT_MAX,
    );
    // 가장 최근 노출이 목록 앞에 있다
    expect(session.recentImpressions[0]).toBe(RECENT_IMPRESSIONS_MAX + 49);
  });

  it("같은 상품 재노출은 목록 중복 없이 횟수만 올린다", () => {
    let session = emptySession("s1");
    session = applyImpression(session, 7);
    session = applyImpression(session, 7);
    expect(session.recentImpressions.filter((g) => g === 7)).toHaveLength(1);
    expect(session.impressionCounts["7"]).toBe(2);
  });
});

describe("foldSessionIntoLongTerm (세션 종료 시 장기 반영)", () => {
  it("장기 앵커는 감쇠하고 세션 앵커 가중치가 더해진다", () => {
    let longTerm = emptyLongTerm();
    let session = emptySession("s1");
    session = applyAction(session, { type: "wish", goodsNo: 1, nowMs: NOW });
    longTerm = foldSessionIntoLongTerm(longTerm, session, NOW);
    const w1 = longTerm.anchors[0].weight;
    expect(w1).toBeCloseTo(SIGNAL_WEIGHTS.wish);

    // 행동 없는 세션이 하나 지나가면 감쇠만 일어난다
    longTerm = foldSessionIntoLongTerm(longTerm, emptySession("s2"), NOW + 1);
    expect(longTerm.anchors[0].weight).toBeCloseTo(w1 * DECAY_PER_SESSION);
  });

  it("장기 앵커 상한을 넘으면 가중치 최저부터 가지치기한다", () => {
    let longTerm = emptyLongTerm();
    for (let n = 1; n <= LONG_ANCHOR_MAX + 10; n += 1) {
      let session = emptySession(`s${String(n)}`);
      session = applyAction(session, { type: "wish", goodsNo: n, nowMs: NOW });
      longTerm = foldSessionIntoLongTerm(longTerm, session, NOW + n);
    }
    expect(longTerm.anchors).toHaveLength(LONG_ANCHOR_MAX);
    // 오래돼 감쇠가 누적된 초기 앵커가 먼저 밀려난다
    expect(longTerm.anchors.some((a) => a.goodsNo === LONG_ANCHOR_MAX + 10)).toBe(true);
  });

  it("세션의 찜 해제는 장기 앵커도 제거한다", () => {
    let longTerm = emptyLongTerm();
    let s1 = emptySession("s1");
    s1 = applyAction(s1, { type: "wish", goodsNo: 9, nowMs: NOW });
    longTerm = foldSessionIntoLongTerm(longTerm, s1, NOW);

    let s2 = emptySession("s2");
    s2 = applyAction(s2, { type: "unwish", goodsNo: 9, nowMs: NOW + 1 });
    longTerm = foldSessionIntoLongTerm(longTerm, s2, NOW + 1);
    expect(longTerm.anchors.some((a) => a.goodsNo === 9)).toBe(false);
  });
});

describe("mergeLongTerm (멀티탭 병합)", () => {
  it("앵커 합집합 + 가중 최대를 취한다", () => {
    const a = emptyLongTerm();
    a.anchors = [
      { goodsNo: 1, weight: 3, lastMs: NOW },
      { goodsNo: 2, weight: 1, lastMs: NOW },
    ];
    const b = emptyLongTerm();
    b.anchors = [
      { goodsNo: 1, weight: 5, lastMs: NOW + 1 },
      { goodsNo: 3, weight: 2, lastMs: NOW },
    ];
    const merged = mergeLongTerm(a, b);
    expect(merged.anchors).toHaveLength(3);
    expect(merged.anchors.find((x) => x.goodsNo === 1)?.weight).toBe(5);
  });
});
