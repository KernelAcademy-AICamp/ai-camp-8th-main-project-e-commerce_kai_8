import { beforeEach, describe, expect, it } from "vitest";

import {
  clearReachMark,
  finishReach,
  ONBOARDING_STEPS,
  readReachMark,
} from "./reach-mark";

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

  it("단계 목록은 화면 순서와 같다", () => {
    expect(ONBOARDING_STEPS).toEqual(["gender", "picks", "signup", "done"]);
  });
});

describe("온보딩 완료 처리", () => {
  it("done을 보고한 뒤 표식을 지운다", () => {
    // 지우고 보내면 표식이 없어 중복 거르기가 안 된다
    const 보낸것: string[] = [];
    readReachMark(storage, () => "표식-1");
    finishReach(storage, (mark, step) => {
      보낸것.push(`${mark}/${step}`);
    });
    expect(보낸것).toEqual(["표식-1/done"]);
    // 지워졌으므로 다음에 부르면 새 값이다
    expect(readReachMark(storage, () => "표식-2")).toBe("표식-2");
  });

  it("표식이 없으면 done을 보내지 않는다", () => {
    // 표식이 없다는 건 이 브라우저에서 온보딩 화면을 지나온 적이 없다는 뜻이다.
    // 계정 승계 경로(onboarding-account-sync)는 **앱을 켤 때마다** 돌기 때문에,
    // 여기서 표식을 새로 만들어 보고하면 done이 "이미 온보딩한 사람이 앱을 켰다"를
    // 세게 된다. 실제로 그 일이 있었다 — done(8)이 picks(6)보다 컸다.
    const 보낸것: string[] = [];
    finishReach(storage, (mark, step) => {
      보낸것.push(`${mark}/${step}`);
    });
    expect(보낸것).toEqual([]);
  });

  it("한 번 마치면 두 번째 호출은 아무것도 보내지 않는다", () => {
    // 완료 지점이 둘이라(화면 경로, 계정 승계 경로) 같은 완료에 두 번 불릴 수 있다.
    // 첫 호출이 표식을 지우므로 두 번째는 조용히 넘어간다.
    const 보낸것: string[] = [];
    readReachMark(storage, () => "표식-1");
    const 보고 = (mark: string, step: string): void => {
      보낸것.push(`${mark}/${step}`);
    };
    finishReach(storage, 보고);
    finishReach(storage, 보고);
    expect(보낸것).toEqual(["표식-1/done"]);
  });

  it("저장소를 못 쓰면 조용히 넘어간다", () => {
    // 프라이빗 모드. 세는 것보다 온보딩이 먼저다.
    const 보낸것: string[] = [];
    expect(() => {
      finishReach(brokenStorage(), (mark, step) => {
        보낸것.push(`${mark}/${step}`);
      });
    }).not.toThrow();
    expect(보낸것).toEqual([]);
  });
});
