import { describe, expect, it } from "vitest";

import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import {
  type IntentChip,
  queryIntentToChips,
} from "@/features/search/domain/query-intent-chips";

function intent(p: Partial<QueryIntent>): QueryIntent {
  return {
    ...EMPTY_INTENT,
    ...p,
    style: { ...EMPTY_INTENT.style, ...(p.style ?? {}) },
  };
}
const labels = (chips: IntentChip[]): string[] => chips.map((c) => c.label);

describe("queryIntentToChips — 브랜드", () => {
  it("brand가 있으면 맨 앞에 브랜드 칩", () => {
    const chips = queryIntentToChips({ ...EMPTY_INTENT, brand: "나이키" });
    expect(chips[0]).toEqual({ kind: "brand", label: "나이키" });
  });
});

describe("queryIntentToChips", () => {
  it("스타일 값마다 개별 칩(색·핏)", () => {
    const chips = queryIntentToChips(
      intent({
        style: {
          colors: ["블랙", "화이트"],
          patterns: [],
          materials: [],
          fits: ["오버"],
          keywords: [],
        },
      }),
    );
    expect(labels(chips)).toEqual(expect.arrayContaining(["블랙", "화이트", "오버핏"]));
    expect(chips.find((c) => c.label === "블랙")?.kind).toBe("color");
  });
  it("착용감은 축:값 라벨", () => {
    const chips = queryIntentToChips(
      intent({ wearChars: { ...EMPTY_INTENT.wearChars, 촉감: ["부드러움"] } }),
    );
    expect(chips).toContainEqual({ kind: "wear", label: "촉감:부드러움" });
  });
  it("성별·사이즈·가격 칩(가격은 정확한 원 표기)", () => {
    const chips = queryIntentToChips(
      intent({ gender: "여성", sizeStd: [90, 95], priceMax: 35000 }),
    );
    expect(chips.find((c) => c.kind === "gender")?.label).toBe("여성");
    expect(chips.find((c) => c.kind === "size")?.label).toBe("사이즈 90·95");
    expect(chips.find((c) => c.kind === "price")?.label).toBe("35,000원 이하");
  });
  it("exclude 값은 '제외' 칩", () => {
    const chips = queryIntentToChips(
      intent({
        exclude: {
          colors: ["레드"],
          patterns: [],
          materials: [],
          fits: [],
          keywords: [],
        },
      }),
    );
    expect(chips).toContainEqual({ kind: "exclude", label: "레드 제외" });
  });
  it("빈 intent는 빈 배열", () => {
    expect(queryIntentToChips(EMPTY_INTENT)).toEqual([]);
  });
  it("titleTokens는 브랜드 칩 다음에 title 칩으로", () => {
    const chips = queryIntentToChips({
      ...EMPTY_INTENT,
      brand: "나이키",
      titleTokens: ["드라이핏"],
    });
    expect(chips[0]).toEqual({ kind: "brand", label: "나이키" });
    expect(chips[1]).toEqual({ kind: "title", label: "드라이핏" });
  });
});
