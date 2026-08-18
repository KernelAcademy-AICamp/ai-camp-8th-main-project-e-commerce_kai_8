import { describe, expect, it } from "vitest";

import { readCarriedWishes, WISH_CARRY_KEY } from "@/shared/identity/wish-carry";

import { uploadCarriedWishes } from "./upload-carried-wishes";
import { WishlistFullError } from "./wishlist-api";

function storageWith(goodsNos: number[]): Storage {
  const data = new Map<string, string>();
  if (goodsNos.length > 0) {
    data.set(
      WISH_CARRY_KEY,
      JSON.stringify(goodsNos.map((goodsNo) => ({ product: { goodsNo } }))),
    );
  }
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
  };
}

describe("uploadCarriedWishes", () => {
  it("보관함이 비어 있으면 아무것도 부르지 않는다", async () => {
    const calls: number[] = [];
    const storage = storageWith([]);

    const result = await uploadCarriedWishes((n) => {
      calls.push(n);
      return Promise.resolve();
    }, storage);

    expect(calls).toEqual([]);
    expect(result).toEqual({ uploaded: 0, remaining: 0, capped: false });
  });

  it("전부 성공하면 보관함을 비운다", async () => {
    const storage = storageWith([11, 22]);

    const result = await uploadCarriedWishes(() => Promise.resolve(), storage);

    expect(result).toEqual({ uploaded: 2, remaining: 0, capped: false });
    expect(storage.getItem(WISH_CARRY_KEY)).toBeNull();
  });

  it("실패한 것만 남긴다 — 다음 접속에 이어서 시도한다", async () => {
    const storage = storageWith([11, 22, 33]);

    const result = await uploadCarriedWishes(
      (n) => (n === 22 ? Promise.reject(new Error("네트워크")) : Promise.resolve()),
      storage,
    );

    expect(result).toEqual({ uploaded: 2, remaining: 1, capped: false });
    expect(readCarriedWishes(storage)).toEqual([22]);
  });

  it("상한에 걸리면 거기서 멈추고 나머지를 남긴다", async () => {
    // 상한을 넘긴 뒤에도 계속 부르면 실패 요청만 늘어난다.
    const calls: number[] = [];
    const storage = storageWith([11, 22, 33, 44]);

    const result = await uploadCarriedWishes((n) => {
      calls.push(n);
      return n >= 22 ? Promise.reject(new WishlistFullError()) : Promise.resolve();
    }, storage);

    expect(calls).toEqual([11, 22]);
    expect(result).toEqual({ uploaded: 1, remaining: 3, capped: true });
    expect(readCarriedWishes(storage)).toEqual([22, 33, 44]);
  });
});
