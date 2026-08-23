import { beforeEach, describe, expect, it } from "vitest";

import { PICKS_KEY } from "@/shared/onboarding/onboarding-store";

import {
  carryOnboarding,
  clearCarriedOnboarding,
  isCarriedForOther,
  ONBOARDING_CARRY_KEY,
  readCarriedOnboarding,
  shouldCarryOnboarding,
} from "./onboarding-carry";

const A = "user-a";
const B = "user-b";
const PICKS = '[{"goods_no":11,"card_pos":0,"pick_seq":0}]';
const GENDER_KEY = "atee-gender";

/** 로그인 전에 여성 옷을 고른 기기를 만든다. */
function deviceChoseFemale(): void {
  storage.setItem(PICKS_KEY, PICKS);
  storage.setItem(GENDER_KEY, "여성");
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

let storage: Storage;
beforeEach(() => {
  storage = memoryStorage();
});

describe("shouldCarryOnboarding", () => {
  it("익명 → 사용자일 때만 옮긴다", () => {
    expect(shouldCarryOnboarding("anon", A)).toBe(true);
  });

  it("로그아웃에서는 옮기지 않는다 — 계정에 이미 있다", () => {
    expect(shouldCarryOnboarding(A, "anon")).toBe(false);
  });

  it("계정 전환에서는 옮기지 않는다 — A가 고른 옷이 B 계정으로 들어간다", () => {
    expect(shouldCarryOnboarding(A, B)).toBe(false);
  });

  it("처리 이력이 없거나 같은 신원이면 전환이 아니다", () => {
    expect(shouldCarryOnboarding(null, A)).toBe(false);
    expect(shouldCarryOnboarding(A, A)).toBe(false);
  });
});

describe("carryOnboarding", () => {
  it("대상 계정과 **고른 성별**을 함께 담는다", () => {
    deviceChoseFemale();
    carryOnboarding(storage, A);
    expect(readCarriedOnboarding(storage, A)).toEqual({
      userId: A,
      gender: "여성",
      picks: [{ goodsNo: 11, cardPos: 0, pickSeq: 0 }],
    });
  });

  // 실제로 일어난 실패다(브라우저 실측). 성별이 함께 안 다니면, 신원 전환 정리가
  // 기기 성별을 지운 뒤 계정의 옛 성별(남성)이 먼저 내려와 자리를 차지하고,
  // 그 성별로 여성 후보를 올리다 서버에 거부당해 **영원히 실패하는 재시도**가 된다.
  it("성별이 없으면 옮기지 않는다 — 올릴 수 없는 것을 큐에 남기지 않는다", () => {
    storage.setItem(PICKS_KEY, PICKS);
    carryOnboarding(storage, A);
    expect(storage.getItem(ONBOARDING_CARRY_KEY)).toBeNull();
  });

  it("성별이 빠진 옛 보관함은 없는 것으로 본다", () => {
    storage.setItem(
      ONBOARDING_CARRY_KEY,
      JSON.stringify({
        userId: A,
        picks: [{ goods_no: 11, card_pos: 0, pick_seq: 0 }],
      }),
    );
    expect(readCarriedOnboarding(storage, A)).toBeNull();
  });

  it("다른 사람에게는 넘어가지 않는다 — 이것이 성별 보관함과 다른 점이다", () => {
    deviceChoseFemale();
    carryOnboarding(storage, A);
    expect(readCarriedOnboarding(storage, B)).toBeNull();
    expect(isCarriedForOther(storage, B)).toBe(true);
    expect(isCarriedForOther(storage, A)).toBe(false);
  });

  it("고른 것이 없으면 보관함을 만들지 않는다", () => {
    carryOnboarding(storage, A);
    expect(storage.getItem(ONBOARDING_CARRY_KEY)).toBeNull();
  });

  it("지난번 옮기기가 안 끝났으면 덮어쓰지 않는다", () => {
    deviceChoseFemale();
    carryOnboarding(storage, A);
    storage.setItem(PICKS_KEY, '[{"goods_no":99,"card_pos":1,"pick_seq":0}]');
    carryOnboarding(storage, A);
    expect(readCarriedOnboarding(storage, A)?.picks).toEqual([
      { goodsNo: 11, cardPos: 0, pickSeq: 0 },
    ]);
  });

  it("선택 본체는 지우지 않는다 — 정리가 지운다", () => {
    deviceChoseFemale();
    carryOnboarding(storage, A);
    expect(storage.getItem(PICKS_KEY)).toBe(PICKS);
  });

  it("깨진 보관함은 없는 것으로 본다", () => {
    storage.setItem(ONBOARDING_CARRY_KEY, "{");
    expect(readCarriedOnboarding(storage, A)).toBeNull();
    expect(isCarriedForOther(storage, A)).toBe(false);
  });

  it("비우면 사라진다", () => {
    deviceChoseFemale();
    carryOnboarding(storage, A);
    clearCarriedOnboarding(storage);
    expect(readCarriedOnboarding(storage, A)).toBeNull();
  });
});
