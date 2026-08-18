// 실데이터 스모크(계획 6단계 완료 기준) — 원격 search_goods 뷰에 대해 어댑터를 실행한다.
// 기본은 스킵. 실행: COLORWAY_LIVE=1 npx vitest run features/search/data/colorway-adapter.live.test.ts
// 전제: 20260807120000_colorway_prints_view.sql 적용(뷰에 base_colors·prints 노출).
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { ColorwayProductRow } from "../domain/colorway-evaluate";
import { interpretColorwayQuery } from "../domain/colorway-interpret";
import { compileColorwayPlan } from "../domain/colorway-plan";
import {
  applyColorwayPrefilter,
  COLORWAY_COLUMNS,
  refineColorwayRows,
} from "./colorway-adapter";

function loadEnvLocal(): void {
  const p = path.resolve(__dirname, "../../../.env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const live = process.env.COLORWAY_LIVE === "1";

describe.skipIf(!live)("colorway-adapter 실데이터 스모크", () => {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  async function runSearch(query: string): Promise<number[]> {
    const supabase = createClient(url, key);
    const plan = compileColorwayPlan(interpretColorwayQuery(query));
    const base = supabase
      .from("search_goods")
      .select(`goods_no,${COLORWAY_COLUMNS}`)
      .limit(1000);
    // PostgrestFilterBuilder는 ColorwayFilterable을 구조적으로 만족한다.
    const { data, error } = await applyColorwayPrefilter(base, plan);
    if (error) throw new Error(error.message);
    const rows = data as unknown as ColorwayProductRow[];
    return refineColorwayRows(rows, plan).map((r) => r.goods_no);
  }

  it("블랙 바탕에 화이트 프린팅 → 6660007(블랙 컬러웨이·화이트 잉크)이 나온다", async () => {
    const got = await runSearch("블랙 바탕에 화이트 프린팅");
    expect(got).toContain(6660007);
  });

  it("블랙 바탕에 블랙 프린팅 → 6660007이 나오지 않는다", async () => {
    const got = await runSearch("블랙 바탕에 블랙 프린팅");
    expect(got).not.toContain(6660007);
  });

  it("화이트 바탕에 블랙 프린팅 → 5079891이 나온다", async () => {
    const got = await runSearch("화이트 바탕에 블랙 프린팅");
    expect(got).toContain(5079891);
  });

  it("블랙 티셔츠(바탕 단독) → 기존 colors 필드 기준 전 카탈로그(D7)", async () => {
    const got = await runSearch("블랙 티셔츠");
    expect(got.length).toBeGreaterThan(50); // 라벨 12건이 아니라 전 카탈로그에서 검색된다
    expect(got).toContain(6660007); // 블랙 상품 포함
  });
});
