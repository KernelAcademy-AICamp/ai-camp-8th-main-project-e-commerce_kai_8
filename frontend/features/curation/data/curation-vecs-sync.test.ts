// 큐레이션 대표 벡터의 재료가 화면 데이터와 **같은지** 지킨다.
//
// 대표 벡터는 서버 표(c_curation_vecs)에 미리 계산돼 있고, 그 재료 목록은
// 마이그레이션 파일에 박힌 curations.json의 사본이다. gen_curation_page.py가
// curations.json을 다시 만들면 사본이 낡는데, 낡아도 화면은 멀쩡히 그려진다
// (그 큐레이션만 벡터 점수 없이 키워드로 정렬된다). 조용히 나빠지므로 여기서 잡는다.
//
// 어긋나면: 마이그레이션의 groups 목록을 curations.json 기준으로 다시 만들고 재적용한다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import curations from "./curations.json";

const MIGRATION = fileURLToPath(
  new URL(
    "../../../../backend/supabase/migrations/20260822500000_curation_vec_rank.sql",
    import.meta.url,
  ),
);

/** 마이그레이션의 `('key', array[...]::bigint[])` 줄에서 키 → 상품 번호 */
function groupsInMigration(): Record<string, number[]> {
  const sql = readFileSync(MIGRATION, "utf8");
  const found: Record<string, number[]> = {};
  for (const m of sql.matchAll(
    /\('([a-z0-9_]+)',\s*array\[([\d,]+)\]::bigint\[\]\)/g,
  )) {
    found[m[1]] = m[2].split(",").map(Number);
  }
  return found;
}

/** 화면 데이터의 키 → 상품 번호 (판매처 주소에서 뽑는다 — curation-product와 같은 규칙) */
function groupsInJson(): Record<string, number[]> {
  const found: Record<string, number[]> = {};
  for (const c of curations) {
    found[c.key] = c.items
      .map((it) => /\/products\/(\d+)/.exec(it.u)?.[1])
      .filter((no): no is string => no !== undefined)
      .map(Number);
  }
  return found;
}

describe("c_curation_vecs 재료", () => {
  it("마이그레이션의 상품 묶음이 curations.json과 같다", () => {
    expect(groupsInMigration()).toEqual(groupsInJson());
  });
});
