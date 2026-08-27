import { beforeEach, describe, expect, it } from "vitest";

import { clearReachMark, ONBOARDING_STEPS, readReachMark } from "./reach-mark";

/** 브라우저 저장소를 흉내 낸다 — 도메인은 진짜 저장소를 몰라야 한다 */
function fakeStorage(): Storage {
  const box = new Map<string, string>();
  return {
    getItem: (k) => box.get(k) ?? null,
    setItem: (k, v) => {
      box.set(k, v);
    },
    removeItem: (k) => {
      box.delete(k);
    },
    clear: () => {
      box.clear();
    },
    key: (i) => [...box.keys()][i] ?? null,
    get length() {
      return box.size;
    },
  };
}

/** 접근하면 터지는 저장소 — 프라이빗 모드를 흉내 낸다 */
function brokenStorage(): Storage {
  const throwing = (): never => {
    throw new Error("접근 불가");
  };
  return {
    getItem: throwing,
    setItem: throwing,
    removeItem: throwing,
    clear: throwing,
    key: () => null,
    length: 0,
  };
}

let storage: Storage;
beforeEach(() => {
  storage = fakeStorage();
});

describe("온보딩 진행 표식", () => {
  it("처음 부르면 표식을 만들어 돌려준다", () => {
    const mark = readReachMark(storage, () => "만든-값");
    expect(mark).toBe("만든-값");
  });

  it("두 번째부터는 같은 값을 돌려준다", () => {
    // 값이 매번 바뀌면 뒤로 갔다 온 사람이 새 사람으로 세어진다
    const first = readReachMark(storage, () => "첫-값");
    const second = readReachMark(storage, () => "다른-값");
    expect(second).toBe(first);
  });

  it("지우면 다음에 새로 만든다", () => {
    // 온보딩이 끝나면 지운다 — 표식이 남으면 로그인 후에도 식별자가 살아 있다
    readReachMark(storage, () => "첫-값");
    clearReachMark(storage);
    expect(readReachMark(storage, () => "새-값")).toBe("새-값");
  });

  it("저장소를 못 쓰면 값을 만들되 남기지 않는다", () => {
    // 프라이빗 모드에서 터지면 온보딩 자체가 멈춘다. 세는 것보다 온보딩이 먼저다.
    expect(() => readReachMark(brokenStorage(), () => "값")).not.toThrow();
  });

  it("지우기가 터져도 넘어간다", () => {
    expect(() => {
      clearReachMark(brokenStorage());
    }).not.toThrow();
  });

  it("단계 목록은 화면 순서와 같고 완료는 없다", () => {
    // **완료(done)를 이 표식으로 세지 않는다** (2026-08-27). 이 키는 로그인 순간
    // 신원 전환 정리가 지우기 때문에, 완료를 여기서 세려던 시도가 두 번 다 틀렸다 —
    // 표식을 새로 만들어 보고하던 때는 페이지를 열 때마다 세어졌고(08-25 39건·
    // 08-26 68건, 같은 기간 실제 가입 1건·0건), 만들지 않게 고친 뒤에는 0이 됐다.
    // 가입과 온보딩 확정은 서버(`c_signup_daily`)에 이미 정확히 남는다.
    expect(ONBOARDING_STEPS).toEqual(["gender", "picks", "signup"]);
    expect(ONBOARDING_STEPS).not.toContain("done");
  });
});
