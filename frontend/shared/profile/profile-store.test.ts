// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { type AnchorGender, emptySession, type SessionProfile } from "./profile-rules";
import {
  applyAnchorGenders,
  foldSessionProfileNow,
  getProfileSummary,
  longAnchorsMissingGender,
  readLongTerm,
} from "./profile-store";

const SESSION_KEY = "atee-session-profile";
const LONG_KEY = "atee-profile";

function sessionWith(anchors: { goodsNo: number; weight: number }[]): SessionProfile {
  return {
    ...emptySession("s-1"),
    anchors: anchors.map((a) => ({ ...a, lastMs: 100 })),
    recentImpressions: [7, 8],
    boostRemaining: 3,
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("foldSessionProfileNow — 마이페이지 새로고침의 즉시 접기", () => {
  it("세션 앵커를 장기로 접고 접었다고 알린다", () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify(sessionWith([{ goodsNo: 1, weight: 2 }])),
    );

    expect(foldSessionProfileNow(1000)).toBe(true);
    expect(readLongTerm().anchors).toEqual([{ goodsNo: 1, weight: 2, lastMs: 100 }]);
  });

  it("접은 뒤 세션 앵커를 비워 세션 종료 때 두 번 반영되지 않는다", () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify(sessionWith([{ goodsNo: 1, weight: 2 }])),
    );
    foldSessionProfileNow(1000);

    const stored = JSON.parse(
      sessionStorage.getItem(SESSION_KEY) ?? "{}",
    ) as SessionProfile;
    expect(stored.anchors).toEqual([]);
    // 노출 기억은 남긴다 — 피드의 "최근 본 것 제외"가 여기에 기댄다
    expect(stored.recentImpressions).toEqual([7, 8]);
    expect(stored.boostRemaining).toBe(3);
    expect(stored.sessionId).toBe("s-1");
  });

  it("접을 것이 없으면 아무것도 안 하고 false — 빈 접기로 장기를 감쇠시키지 않는다", () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 1,
        anchors: [{ goodsNo: 9, weight: 1, lastMs: 50 }],
        updatedAtMs: 50,
      }),
    );
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionWith([])));

    expect(foldSessionProfileNow(1000)).toBe(false);
    expect(readLongTerm().anchors[0].weight).toBe(1); // 0.9로 깎이지 않았다
  });

  it("세션 프로필이 아예 없어도 false", () => {
    expect(foldSessionProfileNow(1000)).toBe(false);
  });

  it("접기의 감쇠가 저장까지 살아남는다", () => {
    // 회귀: 접은 결과를 멀티탭 병합(가중 최대)으로 저장해 감쇠(0.9)가
    // 병합에서 옛 가중치에 져 되돌아갔다 — 오래된 취향이 영영 안 옅어졌다.
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 1,
        anchors: [{ goodsNo: 9, weight: 1, lastMs: 50 }],
        updatedAtMs: 50,
      }),
    );
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify(sessionWith([{ goodsNo: 1, weight: 2 }])),
    );

    foldSessionProfileNow(1000);
    const nine = readLongTerm().anchors.find((a) => a.goodsNo === 9);
    expect(nine?.weight).toBeCloseTo(0.9);
  });

  it("옛 프로필(v1, 성별 없는 앵커) 로드가 오류 없이 통과한다", () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 1,
        anchors: [{ goodsNo: 9, weight: 1, lastMs: 50 }],
        updatedAtMs: 50,
      }),
    );
    const loaded = readLongTerm();
    expect(loaded.anchors).toEqual([{ goodsNo: 9, weight: 1, lastMs: 50 }]);
    expect(loaded.anchors[0].gender).toBeUndefined();
  });

  it("찜 해제만 있어도 접는다 — 해제도 장기에 반영할 변화다", () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 1,
        anchors: [{ goodsNo: 9, weight: 1, lastMs: 50 }],
        updatedAtMs: 50,
      }),
    );
    const s = { ...sessionWith([]), removed: [9] };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));

    expect(foldSessionProfileNow(1000)).toBe(true);
    expect(readLongTerm().anchors).toEqual([]);
  });
});

describe("getProfileSummary — 성별 판정(설계: 성별 피드 하드 필터 2단계)", () => {
  it("장기+세션 앵커를 합쳐 우세 성별을 판정한다 (모수 충족 = 잠금)", () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [
          { goodsNo: 1, weight: 3, lastMs: 10, gender: "여성" },
          { goodsNo: 2, weight: 3, lastMs: 10, gender: "여성" },
        ],
        updatedAtMs: 10,
      }),
    );
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        sessionId: "s-1",
        anchors: [{ goodsNo: 3, weight: 3, lastMs: 10, gender: "여성" }],
        impressionCounts: {},
        recentImpressions: [],
        removed: [],
        boostRemaining: 0,
      }),
    );

    expect(getProfileSummary("s-1", 20).gender).toBe("여성");
  });

  it("성별 있는 앵커가 모수(GENDER_MIN_ANCHORS)에 못 미치면 null (미달)", () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [{ goodsNo: 1, weight: 3, lastMs: 10, gender: "여성" }],
        updatedAtMs: 10,
      }),
    );

    expect(getProfileSummary("s-1", 20).gender).toBeNull();
  });
});

describe("longAnchorsMissingGender / applyAnchorGenders — 기존 장기 앵커 성별 1회 보강(3단계)", () => {
  it("성별 없는 장기 앵커의 goods_no만 돌려준다", () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [
          { goodsNo: 1, weight: 1, lastMs: 10, gender: "남성" },
          { goodsNo: 2, weight: 1, lastMs: 10 },
          { goodsNo: 3, weight: 1, lastMs: 10 },
        ],
        updatedAtMs: 10,
      }),
    );

    expect(longAnchorsMissingGender().sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("성별 없는 앵커가 없으면 빈 배열", () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [{ goodsNo: 1, weight: 1, lastMs: 10, gender: "남성" }],
        updatedAtMs: 10,
      }),
    );

    expect(longAnchorsMissingGender()).toEqual([]);
  });

  it("응답을 성별 없는 앵커에만 반영한다 — 이미 있는 성별은 덮지 않는다", () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [
          { goodsNo: 1, weight: 1, lastMs: 10, gender: "남성" },
          { goodsNo: 2, weight: 1, lastMs: 10 },
        ],
        updatedAtMs: 10,
      }),
    );

    const genders = new Map<number, AnchorGender>([
      [1, "여성"],
      [2, "여성"],
    ]);
    applyAnchorGenders(genders);

    const anchors = readLongTerm().anchors;
    expect(anchors.find((a) => a.goodsNo === 1)?.gender).toBe("남성");
    expect(anchors.find((a) => a.goodsNo === 2)?.gender).toBe("여성");
  });

  it("응답에 없는 goods_no(뷰에 없거나 빈 문자열)는 미상으로 남는다", () => {
    localStorage.setItem(
      LONG_KEY,
      JSON.stringify({
        schemaVersion: 2,
        anchors: [{ goodsNo: 5, weight: 1, lastMs: 10 }],
        updatedAtMs: 10,
      }),
    );

    applyAnchorGenders(new Map());

    expect(readLongTerm().anchors[0].gender).toBeUndefined();
  });
});
