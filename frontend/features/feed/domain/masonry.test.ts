import { describe, expect, it } from "vitest";

import { distributeToColumns } from "@/features/feed/domain/masonry";

interface Card {
  id: string;
  width: number;
  height: number;
}

const card = (id: string, ratio: number): Card => ({
  id,
  width: 100,
  height: 100 * ratio,
});

describe("distributeToColumns", () => {
  it("각 항목을 누적 높이가 가장 낮은 열에 넣는다 (같으면 왼쪽)", () => {
    const a = card("a", 1);
    const b = card("b", 1);
    const c = card("c", 3);
    const d = card("d", 1);
    expect(distributeToColumns([a, b, c, d], 2)).toEqual([
      [a, c],
      [b, d],
    ]);
  });

  it("모든 항목이 정확히 한 번씩 배치된다", () => {
    const items = Array.from({ length: 25 }, (_, i) =>
      card(String(i), 1 + (i % 3) * 0.2),
    );
    const columns = distributeToColumns(items, 2);
    const placed = columns.flat();
    expect(placed).toHaveLength(items.length);
    expect(new Set(placed.map((p) => p.id)).size).toBe(items.length);
  });

  it("빈 입력이면 빈 열들을 돌려준다", () => {
    expect(distributeToColumns([], 2)).toEqual([[], []]);
  });
});
