// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptySession, type SessionProfile } from "./profile-rules";
import { foldSessionProfileNow, readLongTerm } from "./profile-store";

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

    expect(foldSessionProfileNow(1000)).toBe("folded");
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

    expect(foldSessionProfileNow(1000)).toBe("no_changes");
    expect(readLongTerm().anchors[0].weight).toBe(1); // 0.9로 깎이지 않았다
  });

  it("세션 프로필이 아예 없으면 no_changes — 오류가 아니라 접을 게 없는 것이다", () => {
    expect(foldSessionProfileNow(1000)).toBe("no_changes");
  });

  it("저장소가 막히면 local_error — no_changes와 섞이면 오류가 「변화 없음」으로 보인다", () => {
    // 계측이 이 둘을 구분해 기록한다. 한 값으로 뭉치면 관리자 화면에서
    // 기기 저장소 고장이 「새 행동이 없었음」 막대에 섞여 영영 안 보인다.
    const blocked = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    try {
      expect(foldSessionProfileNow(1000)).toBe("local_error");
    } finally {
      blocked.mockRestore();
    }
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

  it("옛 프로필(v1) 로드가 오류 없이 통과한다", () => {
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

    expect(foldSessionProfileNow(1000)).toBe("folded");
    expect(readLongTerm().anchors).toEqual([]);
  });
});
