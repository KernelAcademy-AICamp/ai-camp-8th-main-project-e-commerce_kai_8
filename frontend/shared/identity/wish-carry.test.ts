import { describe, expect, it } from "vitest";

import { WISHLIST_STORAGE_KEY } from "@/features/feed/wishlist/data/wishlist-store";

import { ANONYMOUS } from "./identity-marker";
import {
  carryWishes,
  clearCarriedWishes,
  readCarriedWishes,
  shouldCarryWishes,
  WISH_CARRY_KEY,
} from "./wish-carry";

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => {
      data.clear();
    },
    ...overrides,
  };
}

describe("찜 저장 자리", () => {
  it("찜 저장소가 쓰는 키와 같아야 한다", () => {
    // 이 파일은 찜 feature를 import하지 않고 키 문자열만 안다. 어긋나면 옮기기가
    // 조용히 아무것도 못 옮긴다 — 그래서 여기서 대조한다.
    const storage = fakeStorage();
    storage.setItem(WISHLIST_STORAGE_KEY, '[{"product":{"goodsNo":1}}]');
    carryWishes(storage);
    expect(readCarriedWishes(storage)).toEqual([1]);
  });
});

describe("shouldCarryWishes", () => {
  it("익명 → 사용자면 옮긴다", () => {
    expect(shouldCarryWishes(ANONYMOUS, "user-A")).toBe(true);
  });

  it("사용자 → 익명이면 옮기지 않는다", () => {
    // 로그아웃이다. 로컬에 있던 것은 이미 계정에 있다.
    expect(shouldCarryWishes("user-A", ANONYMOUS)).toBe(false);
  });

  it("사용자 A → 사용자 B면 옮기지 않는다", () => {
    // 옮기면 A의 찜이 B 계정으로 들어간다. 이 조각에서 가장 나쁜 결과다.
    expect(shouldCarryWishes("user-A", "user-B")).toBe(false);
  });

  it("처리 이력이 없는 새 탭에서는 옮기지 않는다", () => {
    expect(shouldCarryWishes(null, "user-A")).toBe(false);
  });

  it("같은 신원이 다시 오면 옮기지 않는다", () => {
    expect(shouldCarryWishes("user-A", "user-A")).toBe(false);
    expect(shouldCarryWishes(ANONYMOUS, ANONYMOUS)).toBe(false);
  });
});

describe("carryWishes", () => {
  it("찜을 보관함으로 옮기고 원래 자리는 비운다", () => {
    const storage = fakeStorage();
    storage.setItem(WISHLIST_STORAGE_KEY, '[{"product":{"goodsNo":1}}]');

    carryWishes(storage);

    expect(storage.getItem(WISH_CARRY_KEY)).toBe('[{"product":{"goodsNo":1}}]');
    expect(storage.getItem(WISHLIST_STORAGE_KEY)).toBeNull();
  });

  it("찜이 없으면 보관함을 만들지 않는다", () => {
    const storage = fakeStorage();
    carryWishes(storage);
    expect(storage.getItem(WISH_CARRY_KEY)).toBeNull();
  });

  it("보관함에 이미 있으면 덮어쓰지 않는다", () => {
    // 지난번 옮기기가 아직 안 끝났다. 덮어쓰면 그 찜을 잃는다.
    const storage = fakeStorage();
    storage.setItem(WISH_CARRY_KEY, '[{"product":{"goodsNo":9}}]');
    storage.setItem(WISHLIST_STORAGE_KEY, '[{"product":{"goodsNo":1}}]');

    carryWishes(storage);

    expect(storage.getItem(WISH_CARRY_KEY)).toBe('[{"product":{"goodsNo":9}}]');
  });

  it("저장소를 못 쓰면 던지지 않는다", () => {
    const storage = fakeStorage({
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    storage.getItem = () => '[{"product":{"goodsNo":1}}]';
    expect(() => {
      carryWishes(storage);
    }).not.toThrow();
  });
});

describe("readCarriedWishes", () => {
  it("보관함이 비었으면 빈 목록", () => {
    expect(readCarriedWishes(fakeStorage())).toEqual([]);
  });

  it("담긴 상품 번호를 읽는다", () => {
    const storage = fakeStorage();
    storage.setItem(
      WISH_CARRY_KEY,
      JSON.stringify([{ product: { goodsNo: 11 } }, { product: { goodsNo: 22 } }]),
    );
    expect(readCarriedWishes(storage)).toEqual([11, 22]);
  });

  it("깨진 값은 빈 목록 — 던지지 않는다", () => {
    const storage = fakeStorage();
    storage.setItem(WISH_CARRY_KEY, "{{{");
    expect(readCarriedWishes(storage)).toEqual([]);
  });

  it("상품 번호가 없는 항목은 건너뛴다", () => {
    const storage = fakeStorage();
    storage.setItem(
      WISH_CARRY_KEY,
      JSON.stringify([{ product: {} }, { product: { goodsNo: 33 } }, {}]),
    );
    expect(readCarriedWishes(storage)).toEqual([33]);
  });
});

describe("clearCarriedWishes", () => {
  it("남은 번호만 다시 적는다 — 성공한 것만 빠진다", () => {
    const storage = fakeStorage();
    storage.setItem(
      WISH_CARRY_KEY,
      JSON.stringify([{ product: { goodsNo: 11 } }, { product: { goodsNo: 22 } }]),
    );

    clearCarriedWishes(storage, [22]);

    expect(readCarriedWishes(storage)).toEqual([22]);
  });

  it("남은 것이 없으면 보관함을 지운다", () => {
    const storage = fakeStorage();
    storage.setItem(WISH_CARRY_KEY, JSON.stringify([{ product: { goodsNo: 11 } }]));

    clearCarriedWishes(storage, []);

    expect(storage.getItem(WISH_CARRY_KEY)).toBeNull();
  });
});
