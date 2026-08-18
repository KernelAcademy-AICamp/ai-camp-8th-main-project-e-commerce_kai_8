// 무신사 상품 사이즈 표 순수 변환 — size_measures → 표시용 표.
// 값 위생처리(0·음수·>120 제거) + 전셀 결측 행/열 제거 + 열 union.
// (대표색 필터는 실데이터에서 거의 no-op이고 멀티팩 구성색을 잘못 숨겨 제거했다.)

import type { SizeMeasureRow } from "@/features/catalog/domain/goods";

const MIN_CM = 0; // 초과여야 유효(0/음수는 결측 sentinel)
const MAX_CM = 120; // 상의 실측 상한 — 초과는 오류/단위이상으로 간주해 숨김

export interface SizeTable {
  cols: string[];
  rows: { name: string; cells: (number | null)[] }[];
}

function sane(v: number): number | null {
  return v > MIN_CM && v <= MAX_CM ? v : null;
}

export function buildSizeTable(rows: SizeMeasureRow[]): SizeTable {
  // 1) 열 union(원 순서 보존)
  const allCols: string[] = [];
  for (const r of rows) {
    for (const it of r.items) {
      if (!allCols.includes(it.name)) allCols.push(it.name);
    }
  }

  // 2) 위생처리한 셀로 행 구성
  const sanitized = rows.map((r) => ({
    name: r.name,
    cells: allCols.map((c) => {
      const it = r.items.find((i) => i.name === c);
      return it ? sane(it.value) : null;
    }),
  }));

  // 3) 전셀 결측 행 제거(위생처리 후 볼 값이 없는 행은 표시하지 않는다)
  const keptRows = sanitized.filter((r) => r.cells.some((v) => v !== null));

  // 4) 남은 행 기준 전셀 결측 열 제거
  const keepCol = allCols.map((_, ci) => keptRows.some((r) => r.cells[ci] !== null));
  const cols = allCols.filter((_, ci) => keepCol[ci]);
  const finalRows = keptRows.map((r) => ({
    name: r.name,
    cells: r.cells.filter((_, ci) => keepCol[ci]),
  }));

  return { cols, rows: finalRows };
}
