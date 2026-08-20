import { describe, expect, it } from "vitest";

import {
  type Anchor,
  applyAction,
  applyImpression,
  DECAY_PER_SESSION,
  deriveDominantGender,
  emptyLongTerm,
  emptySession,
  foldSessionIntoLongTerm,
  GENDER_MIN_ANCHORS,
  GENDER_SHARE_THRESHOLD,
  IMPRESSION_COUNT_MAX,
  LONG_ANCHOR_MAX,
  mergeLongTerm,
  RECENT_IMPRESSIONS_MAX,
  SESSION_ANCHOR_MAX,
  SIGNAL_WEIGHTS,
  STYLE_BOOST_IMPRESSIONS,
  toAnchorGender,
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

describe("스타일 탐색 부스트 (설계 §7 — 노출 60장 기준)", () => {
  it("스타일 탐색이 부스트 카운터를 채우고, 노출마다 줄어 0에서 꺼진다", () => {
    let session = emptySession("s1");
    expect(session.boostRemaining).toBe(0);
    session = applyAction(session, { type: "style_explore", goodsNo: 1, nowMs: NOW });
    expect(session.boostRemaining).toBe(STYLE_BOOST_IMPRESSIONS);
    for (let i = 0; i < STYLE_BOOST_IMPRESSIONS; i += 1) {
      session = applyImpression(session, 100 + i);
    }
    expect(session.boostRemaining).toBe(0);
    session = applyImpression(session, 999);
    expect(session.boostRemaining).toBe(0); // 음수로 내려가지 않는다
  });

  it("부스트 중 다시 스타일 탐색하면 카운터가 다시 차오른다", () => {
    let session = emptySession("s1");
    session = applyAction(session, { type: "style_explore", goodsNo: 1, nowMs: NOW });
    session = applyImpression(session, 2);
    session = applyAction(session, { type: "style_explore", goodsNo: 3, nowMs: NOW });
    expect(session.boostRemaining).toBe(STYLE_BOOST_IMPRESSIONS);
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

describe("앵커 성별 기록", () => {
  it("성별 있는 액션으로 새 앵커가 성별을 갖는다", () => {
    let session = emptySession("s1");
    session = applyAction(session, {
      type: "tap",
      goodsNo: 1,
      nowMs: NOW,
      gender: "남성",
    });
    expect(session.anchors.find((a) => a.goodsNo === 1)?.gender).toBe("남성");
  });

  it("성별 없는 후속 액션이 기존 성별을 지우지 않는다", () => {
    let session = emptySession("s1");
    session = applyAction(session, {
      type: "tap",
      goodsNo: 1,
      nowMs: NOW,
      gender: "여성",
    });
    session = applyAction(session, { type: "wish", goodsNo: 1, nowMs: NOW });
    expect(session.anchors.find((a) => a.goodsNo === 1)?.gender).toBe("여성");
  });

  it("성별 있는 후속 액션은 기존 성별을 갱신한다", () => {
    let session = emptySession("s1");
    session = applyAction(session, {
      type: "tap",
      goodsNo: 1,
      nowMs: NOW,
      gender: "여성",
    });
    session = applyAction(session, {
      type: "wish",
      goodsNo: 1,
      nowMs: NOW,
      gender: "남성",
    });
    expect(session.anchors.find((a) => a.goodsNo === 1)?.gender).toBe("남성");
  });

  it("foldSessionIntoLongTerm이 성별을 잃지 않고 통과시킨다", () => {
    let longTerm = emptyLongTerm();
    let session = emptySession("s1");
    session = applyAction(session, {
      type: "wish",
      goodsNo: 1,
      nowMs: NOW,
      gender: "남성",
    });
    longTerm = foldSessionIntoLongTerm(longTerm, session, NOW);
    expect(longTerm.anchors.find((a) => a.goodsNo === 1)?.gender).toBe("남성");
  });

  it("mergeLongTerm이 한쪽에만 성별이 있으면 있는 쪽 값을 취한다", () => {
    const a = emptyLongTerm();
    a.anchors = [{ goodsNo: 1, weight: 1, lastMs: NOW }];
    const b = emptyLongTerm();
    b.anchors = [{ goodsNo: 1, weight: 5, lastMs: NOW + 1, gender: "여성" }];
    const merged = mergeLongTerm(a, b);
    expect(merged.anchors.find((x) => x.goodsNo === 1)?.gender).toBe("여성");
  });
});

describe("deriveDominantGender (우세 성별 판정)", () => {
  const anchor = (
    goodsNo: number,
    weight: number,
    gender?: Anchor["gender"],
  ): Anchor => ({ goodsNo, weight, lastMs: NOW, gender });

  it("남성 앵커 3개(가중 동일) → 남성", () => {
    const anchors = [anchor(1, 1, "남성"), anchor(2, 1, "남성"), anchor(3, 1, "남성")];
    expect(deriveDominantGender(anchors)).toBe("남성");
  });

  it("남성 2개뿐 → null (최소 개수 미달)", () => {
    const anchors = [anchor(1, 1, "남성"), anchor(2, 1, "남성")];
    expect(deriveDominantGender(anchors)).toBeNull();
  });

  it("남성 3 + 여성 2 (가중 동일) → 남성 비율 60% → 남성 (경계 이상 포함)", () => {
    const anchors = [
      anchor(1, 1, "남성"),
      anchor(2, 1, "남성"),
      anchor(3, 1, "남성"),
      anchor(4, 1, "여성"),
      anchor(5, 1, "여성"),
    ];
    expect(deriveDominantGender(anchors)).toBe("남성");
  });

  it("남성 3 + 여성 3 → 50% → null", () => {
    const anchors = [
      anchor(1, 1, "남성"),
      anchor(2, 1, "남성"),
      anchor(3, 1, "남성"),
      anchor(4, 1, "여성"),
      anchor(5, 1, "여성"),
      anchor(6, 1, "여성"),
    ];
    expect(deriveDominantGender(anchors)).toBeNull();
  });

  it("가중치가 지배: 남성 3개(w=1) + 여성 3개(w=3) → 여성 75% → 여성", () => {
    const anchors = [
      anchor(1, 1, "남성"),
      anchor(2, 1, "남성"),
      anchor(3, 1, "남성"),
      anchor(4, 3, "여성"),
      anchor(5, 3, "여성"),
      anchor(6, 3, "여성"),
    ];
    expect(deriveDominantGender(anchors)).toBe("여성");
  });

  it("공용·성별 미상만 있으면 null", () => {
    const anchors = [anchor(1, 1, "공용"), anchor(2, 1), anchor(3, 1, "공용")];
    expect(deriveDominantGender(anchors)).toBeNull();
  });

  it("빈 배열 → null", () => {
    expect(deriveDominantGender([])).toBeNull();
  });

  it("GENDER_MIN_ANCHORS·GENDER_SHARE_THRESHOLD는 문서화된 시작값이다", () => {
    expect(GENDER_MIN_ANCHORS).toBe(3);
    expect(GENDER_SHARE_THRESHOLD).toBe(0.6);
  });
});

describe("toAnchorGender (상품 성별 → 앵커 성별 변환)", () => {
  it("'남성'은 그대로 남성이다", () => {
    expect(toAnchorGender("남성")).toBe("남성");
  });

  it("'여성'은 그대로 여성이다", () => {
    expect(toAnchorGender("여성")).toBe("여성");
  });

  it("'공용'은 그대로 공용이다", () => {
    expect(toAnchorGender("공용")).toBe("공용");
  });

  it("빈 문자열은 미상(undefined)이다 — 카탈로그의 빈 문자열 성별 1,911건 대응", () => {
    expect(toAnchorGender("")).toBeUndefined();
  });

  it("null은 미상이다", () => {
    expect(toAnchorGender(null)).toBeUndefined();
  });

  it("undefined는 미상이다", () => {
    expect(toAnchorGender(undefined)).toBeUndefined();
  });

  it("정의된 값 외의 문자열(이상값)은 미상이다", () => {
    expect(toAnchorGender("아동")).toBeUndefined();
  });
});
