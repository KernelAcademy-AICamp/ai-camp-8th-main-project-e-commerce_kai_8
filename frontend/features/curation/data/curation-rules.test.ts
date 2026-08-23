import { describe, expect, it } from "vitest";

import rulesData from "@/features/curation/data/curation-rules.json";
import curationData from "@/features/curation/data/curations.json";

/**
 * 두 파일은 각자 생성된다(gen_curation_page.py / gen_curation_rules.py). 한쪽만 다시
 * 뽑아 키가 어긋나면 **개인화가 조용히 아무 일도 하지 않는다** — 화면은 멀쩡한 기본
 * 순서라 아무도 눈치채지 못한다. 그래서 여기서 막는다.
 */
describe("큐레이션 규칙 파일", () => {
  const keys = new Set(curationData.map((c) => c.key));
  const ruleKeys = Object.keys(rulesData);

  it("규칙 키가 전부 실제 큐레이션에 있다", () => {
    expect(ruleKeys.filter((k) => !keys.has(k))).toEqual([]);
  });

  it("개인화가 걸릴 큐레이션이 충분히 있다", () => {
    expect(ruleKeys.length).toBeGreaterThanOrEqual(20);
  });

  it("모든 규칙에 제목 키워드가 하나 이상 있다", () => {
    const empty = ruleKeys.filter(
      (k) => (rulesData as Record<string, { kw: string[] }>)[k].kw.length === 0,
    );
    expect(empty).toEqual([]);
  });
});

/**
 * 성별은 `backfill_item_gender.py`가 뒤늦게 채운 것이라, `gen_curation_page.py`를 다시
 * 돌리면(그쪽도 이제 성별을 싣지만) 빠질 여지가 있다. 빠지면 **거르기가 조용히 멈춘다**
 * — 남성에게 여성복이 다시 보이는데 화면은 멀쩡해 보인다.
 */
describe("큐레이션 상품 성별", () => {
  const items = curationData.flatMap((c) => c.items);

  it("모든 상품에 성별이 실려 있다", () => {
    expect(items.filter((i) => !("g" in i))).toEqual([]);
  });

  it("성별 값은 남성·여성·공용뿐이다", () => {
    const odd = [...new Set(items.map((i) => ("g" in i ? i.g : null)))].filter(
      (g) => g !== "남성" && g !== "여성" && g !== "공용",
    );
    expect(odd).toEqual([]);
  });
});
