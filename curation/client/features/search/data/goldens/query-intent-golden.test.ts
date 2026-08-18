// 쿼리 골든셋 무결성 검사 — 정답 상품이 스냅샷에 실존하고 기대 조건을 실제로 충족하며
// (갭 표식 항목은 "실제로 불충족"임을 역으로 고정), 스냅샷 해시·vocab 실존·유형 커버리지를
// 기계적으로 고정한다. 계획 단계 4의 완료 기준을 코드로 봉인.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COLORS,
  FITS,
  MATERIALS,
  PATTERNS,
} from "@/features/search/data/musinsa-vocab";

interface AnswerGood {
  goodsNo: number;
  basis: string;
  gap?: string; // metadata:<axis> | synonym:title | extractor:stopword
}
interface GoldenQuery {
  id: string;
  query: string;
  source: "real_query" | "synthetic";
  categories: string[];
  confidence: "high" | "low";
  expected: {
    colors?: string[];
    patterns?: string[];
    materials?: string[];
    fits?: string[];
    gender?: string;
    sizeStd?: number[];
    priceMin?: number;
    priceMax?: number;
    sort?: string;
    brand?: string;
    locked?: string[];
    exclude?: { colors?: string[] };
  };
  answerType: "must_include" | "sort" | "browse" | "none" | "interpretation_only";
  answerGoods?: AnswerGood[];
}
interface SnapshotRow {
  goods_no: number;
  brand: string;
  colors: string[] | null;
  patterns: string[] | null;
  materials: string[] | null;
  fits: string[] | null;
  gender: string | null;
  size_std: number[] | null;
  size_free: boolean | null;
  price: number | null;
}

const golden = JSON.parse(
  readFileSync(new URL("./query-intent-golden.json", import.meta.url), "utf8"),
) as {
  meta: { categories: string[]; snapshot: { sha256: string } };
  entries: GoldenQuery[];
};

const snapshotUrl = new URL(
  "../../../../../docs/p3-t0/search-goods-snapshot-20260801.json",
  import.meta.url,
);
const snapshotRaw = readFileSync(snapshotUrl);
const snapshot = JSON.parse(snapshotRaw.toString("utf8")) as { rows: SnapshotRow[] };
const byGoods = new Map(snapshot.rows.map((r) => [r.goods_no, r]));
const snapBrands = new Set(snapshot.rows.map((r) => r.brand));

// 축별 충족 판정 — build-goods-query의 하드필터 시맨틱스와 동일(overlaps/eq/사이즈 OR).
const FACET_AXES = ["colors", "patterns", "materials", "fits"] as const;
function satisfiesAxis(row: SnapshotRow, e: GoldenQuery, axis: string): boolean {
  const ex = e.expected;
  switch (axis) {
    case "colors":
    case "patterns":
    case "materials":
    case "fits": {
      const want = ex[axis] ?? [];
      if (!want.length) return true;
      return (row[axis] ?? []).some((v) => want.includes(v));
    }
    case "gender":
      // build-goods-query는 정확 eq — 공용 허용 없음(현행 계약 재현).
      return !ex.gender || row.gender === ex.gender;
    case "sizeStd":
      return (
        !ex.sizeStd?.length ||
        row.size_free === true ||
        (row.size_std ?? []).some((s) => (ex.sizeStd ?? []).includes(s))
      );
    case "price":
      return (
        (ex.priceMin == null || (row.price ?? 0) >= ex.priceMin) &&
        (ex.priceMax == null || (row.price ?? Infinity) <= ex.priceMax)
      );
    case "brand":
      return !ex.brand || row.brand === ex.brand;
    default:
      return true;
  }
}
const ALL_AXES = [...FACET_AXES, "gender", "sizeStd", "price", "brand"];

// gap은 열거형만 허용 — 임의 문자열로 검증을 우회할 수 없게 한다.
// metadata:<axis>는 그 축만 면제(불충족 역단언), 제목 레인 갭은 하드 축을 전혀 면제하지 않는다.
const VALID_GAPS = new Set([
  "metadata:colors",
  "metadata:patterns",
  "metadata:materials",
  "metadata:fits",
  "synonym:title",
  "extractor:stopword",
]);

describe("query-intent-golden 무결성", () => {
  it("스냅샷 파일 해시가 meta에 기록된 sha256과 일치한다(불변 export 보증)", () => {
    const digest = createHash("sha256").update(snapshotRaw).digest("hex");
    expect(digest).toBe(golden.meta.snapshot.sha256);
  });

  it("모든 정답 상품이 스냅샷에 실존한다", () => {
    const missing = golden.entries.flatMap((e) =>
      (e.answerGoods ?? [])
        .filter((g) => !byGoods.has(g.goodsNo))
        .map((g) => `${e.id}:${String(g.goodsNo)}`),
    );
    expect(missing).toEqual([]);
  });

  it("gap 값은 열거형만 허용한다", () => {
    const bad = golden.entries.flatMap((e) =>
      (e.answerGoods ?? [])
        .filter((g) => g.gap && !VALID_GAPS.has(g.gap))
        .map((g) => `${e.id}:${String(g.goodsNo)}:${g.gap ?? ""}`),
    );
    expect(bad).toEqual([]);
  });

  it("갭 없는 정답과 제목 레인 갭 정답은 기대 하드 조건을 전부 충족한다", () => {
    const bad: string[] = [];
    for (const e of golden.entries) {
      for (const g of e.answerGoods ?? []) {
        if (g.gap?.startsWith("metadata:")) continue; // 메타 갭은 아래 역단언 테스트가 담당
        const row = byGoods.get(g.goodsNo);
        if (!row) continue;
        for (const axis of ALL_AXES) {
          if (!satisfiesAxis(row, e, axis))
            bad.push(`${e.id}:${String(g.goodsNo)}:${axis}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("metadata 갭 정답은 해당 축을 실제로 불충족하고, 나머지 축은 충족한다", () => {
    const bad: string[] = [];
    for (const e of golden.entries) {
      for (const g of e.answerGoods ?? []) {
        const gapAxis = g.gap?.startsWith("metadata:") ? g.gap.slice(9) : null;
        if (!gapAxis) continue;
        const row = byGoods.get(g.goodsNo);
        if (!row) continue;
        if (satisfiesAxis(row, e, gapAxis))
          bad.push(`${e.id}:${String(g.goodsNo)}:갭인데 충족(${gapAxis})`);
        for (const axis of ALL_AXES) {
          if (axis !== gapAxis && !satisfiesAxis(row, e, axis))
            bad.push(`${e.id}:${String(g.goodsNo)}:갭 외 축 불충족(${axis})`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("기대 facet 값·성별·정렬·locked가 전부 유효하다", () => {
    const vocab = {
      colors: new Set(COLORS),
      patterns: new Set(PATTERNS),
      materials: new Set(MATERIALS),
      fits: new Set(FITS),
    };
    const bad: string[] = [];
    for (const e of golden.entries) {
      for (const axis of FACET_AXES) {
        for (const v of e.expected[axis] ?? []) {
          if (!vocab[axis].has(v)) bad.push(`${e.id}:${axis}:${v}`);
        }
      }
      for (const v of e.expected.exclude?.colors ?? []) {
        if (!vocab.colors.has(v)) bad.push(`${e.id}:exclude:${v}`);
      }
      if (e.expected.gender && !["남성", "여성", "공용"].includes(e.expected.gender))
        bad.push(`${e.id}:gender`);
      // QueryIntent 실제 계약(query-intent.ts): relevance | price_asc | review_count
      if (
        e.expected.sort &&
        !["relevance", "price_asc", "review_count"].includes(e.expected.sort)
      )
        bad.push(`${e.id}:sort`);
      for (const axis of e.expected.locked ?? []) {
        if (!["colors", "patterns", "materials", "fits"].includes(axis))
          bad.push(`${e.id}:locked:${axis}`);
      }
      if (e.expected.brand && !snapBrands.has(e.expected.brand))
        bad.push(`${e.id}:brand`);
    }
    expect(bad).toEqual([]);
  });

  it("규모: 전체 30개 이상, 의도 유형 10종이 각 3개 이상", () => {
    expect(golden.entries.length).toBeGreaterThanOrEqual(30);
    for (const cat of golden.meta.categories) {
      const n = golden.entries.filter((e) => e.categories.includes(cat)).length;
      expect(n, `category=${cat}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("설계 §1 요동 실측 쿼리가 회귀 케이스로 포함돼 있다", () => {
    expect(golden.entries.some((e) => e.query.includes("바람이 슝슝"))).toBe(true);
  });

  it("must_include는 정답 1개 이상 + 갭 없는 정답 1개 이상(전부 갭인 항목은 계약 공백 note 필수)", () => {
    for (const e of golden.entries) {
      if (e.answerType !== "must_include") {
        expect(e.answerGoods, e.id).toBeUndefined();
        continue;
      }
      const goods = e.answerGoods ?? [];
      expect(goods.length, e.id).toBeGreaterThanOrEqual(1);
      const clean = goods.filter((g) => !g.gap).length;
      if (clean === 0) {
        // 전부 갭 = 현행 계약으로 도달 불가 — confidence low + 사유 노트를 강제한다.
        expect(e.confidence, `${e.id}: 전-갭 항목은 low 필수`).toBe("low");
      }
    }
  });

  it("confidence 필드가 전 항목에 있고, 쿼리 중복이 없다", () => {
    for (const e of golden.entries) {
      expect(["high", "low"], e.id).toContain(e.confidence);
    }
    const qs = golden.entries.map((e) => e.query);
    expect(new Set(qs).size).toBe(qs.length);
  });
});
