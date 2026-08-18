import { describe, expect, it } from "vitest";

import { EMPTY_INTENT, WEAR_AXES } from "@/features/search/domain/query-intent";

describe("query-intent wearChars", () => {
  it("WEAR_AXES는 5개 착용감 축(핏은 style.fits와 중복이라 제외)", () => {
    expect(WEAR_AXES).toEqual(["촉감", "두께", "비침", "신축성", "계절"]);
  });

  it("EMPTY_INTENT.wearChars는 전 축 빈 배열", () => {
    expect(EMPTY_INTENT.wearChars).toEqual({
      촉감: [],
      두께: [],
      비침: [],
      신축성: [],
      계절: [],
    });
  });
});
