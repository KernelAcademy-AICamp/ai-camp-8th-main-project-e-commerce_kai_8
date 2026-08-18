import { describe, expect, it } from "vitest";

import {
  clearPendingDeletion,
  loadPendingDeletion,
  PENDING_DELETION_KEY,
  savePendingDeletion,
} from "./pending-deletion-store";

const marker = {
  userId: "user-A",
  providerId: "google-sub-1",
  requestedAt: 1_760_000_000_000,
};

/** 진짜 localStorage와 같은 모양의 최소 대역 */
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

describe("savePendingDeletion", () => {
  it("저장하고 다시 읽어 확인되면 참을 낸다", () => {
    const storage = fakeStorage();
    expect(savePendingDeletion(marker, storage)).toBe(true);
    expect(loadPendingDeletion(storage)).toEqual(marker);
  });

  it("저장 자체가 막히면 거짓을 낸다 — 파괴 호출을 보내면 안 된다", () => {
    const storage = fakeStorage({
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(savePendingDeletion(marker, storage)).toBe(false);
  });

  it("저장은 조용히 넘어갔는데 다시 읽으면 없으면 거짓을 낸다", () => {
    // 사파리 프라이빗 모드 등 — 예외 없이 삼키는 환경이 실제로 있다.
    const storage = fakeStorage({
      setItem: () => undefined,
      getItem: () => null,
    });
    expect(savePendingDeletion(marker, storage)).toBe(false);
  });

  it("다시 읽은 값이 다르면 거짓을 낸다", () => {
    const storage = fakeStorage({
      getItem: () => JSON.stringify({ ...marker, userId: "다른-사람" }),
    });
    expect(savePendingDeletion(marker, storage)).toBe(false);
  });
});

describe("loadPendingDeletion", () => {
  it("표식이 없으면 null", () => {
    expect(loadPendingDeletion(fakeStorage())).toBeNull();
  });

  it("깨진 값은 null — 던지지 않는다", () => {
    const storage = fakeStorage();
    storage.setItem(PENDING_DELETION_KEY, "{{{");
    expect(loadPendingDeletion(storage)).toBeNull();
  });

  it("필드가 빠진 값은 null — 반쪽 표식으로 판정하면 오판한다", () => {
    const storage = fakeStorage();
    storage.setItem(
      PENDING_DELETION_KEY,
      JSON.stringify({ userId: "user-A", requestedAt: 1 }),
    );
    expect(loadPendingDeletion(storage)).toBeNull();
  });

  it("읽기 자체가 막히면 null", () => {
    const storage = fakeStorage({
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(loadPendingDeletion(storage)).toBeNull();
  });
});

describe("clearPendingDeletion", () => {
  it("지우면 사라진다", () => {
    const storage = fakeStorage();
    savePendingDeletion(marker, storage);
    clearPendingDeletion(storage);
    expect(loadPendingDeletion(storage)).toBeNull();
  });

  it("지우기가 막혀도 던지지 않는다", () => {
    const storage = fakeStorage({
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => {
      clearPendingDeletion(storage);
    }).not.toThrow();
  });
});
