import { describe, expect, it } from "vitest";

import { extractExplicitFit } from "./extract-explicit-fit";

describe("extract-explicit-fit", () => {
  it("명시 핏 표현을 facet 값으로 매핑한다", () => {
    expect(extractExplicitFit("오버핏 7부 티셔츠")?.fits).toEqual(["오버"]);
    expect(extractExplicitFit("슬림핏 검정 티")?.fits).toEqual(["슬림"]);
    expect(extractExplicitFit("루즈핏은 어때")?.fits).toEqual(["루즈"]);
  });

  it("bare 다의어·무관 표현은 무시한다", () => {
    expect(extractExplicitFit("게임 오버 티셔츠")).toBeNull();
    expect(extractExplicitFit("블랙 티셔츠")).toBeNull();
  });
});
