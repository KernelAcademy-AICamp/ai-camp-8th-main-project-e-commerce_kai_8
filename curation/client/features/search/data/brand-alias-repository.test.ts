import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _clearAliasCache,
  type AliasDb,
  getSafeBrandAliases,
} from "@/features/search/data/brand-alias-repository";

afterEach(() => {
  _clearAliasCache();
  vi.restoreAllMocks();
});

interface FakeDb {
  db: AliasDb;
  selects: () => number;
}

// rows: 단일 페이지 응답을 흉내낼 배열, 또는 range(from,to)별 응답을 미리 정한 페이지 배열의 배열.
function fakeDb(rows: unknown, error: unknown = null): FakeDb {
  let count = 0;
  const pages =
    Array.isArray(rows) && Array.isArray(rows[0]) ? (rows as unknown[][]) : null;
  // order()는 체이닝 가능해야 한다(복합 PK 2회 정렬) — 자기 자신을 반환.
  const ordered = {
    order: () => ordered,
    range: (_from: number) => {
      const idx = count;
      count += 1;
      const data = pages ? (pages[idx] ?? []) : rows;
      return Promise.resolve({ data: data as never, error });
    },
  };
  const db: AliasDb = {
    from: () => ({
      select: () => ({
        eq: () => ordered,
      }),
    }),
  };
  return { db, selects: () => count };
}

describe("getSafeBrandAliases", () => {
  it("safe alias를 camelCase로 매핑한다", async () => {
    const { db } = fakeDb([{ alias_normalized: "나이키", catalog_brand: "나이키" }]);
    const out = await getSafeBrandAliases(db);
    expect(out).toEqual([{ aliasNormalized: "나이키", catalogBrand: "나이키" }]);
  });

  it("성공 결과는 캐시된다(TTL 내 재조회 없음)", async () => {
    const { db, selects } = fakeDb([{ alias_normalized: "a3x", catalog_brand: "A3X" }]);
    await getSafeBrandAliases(db);
    await getSafeBrandAliases(db);
    expect(selects()).toBe(1);
  });

  it("조회 실패는 throw(호출자가 failed 처리)", async () => {
    const { db } = fakeDb(null, { message: "boom" });
    await expect(getSafeBrandAliases(db)).rejects.toThrow();
  });

  it("1000행 초과는 페이지네이션으로 전부 로드한다(조용한 절단 없음)", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      alias_normalized: `brand${i}`,
      catalog_brand: `BRAND${i}`,
    }));
    const page2 = [
      { alias_normalized: "x1", catalog_brand: "X1" },
      { alias_normalized: "x2", catalog_brand: "X2" },
      { alias_normalized: "x3", catalog_brand: "X3" },
    ];
    const { db, selects } = fakeDb([page1, page2]);
    const out = await getSafeBrandAliases(db);
    expect(out).toHaveLength(1003);
    expect(selects()).toBe(2);
  });
});
