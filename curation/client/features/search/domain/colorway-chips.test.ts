// 컬러웨이 칩(설계 §10) — 실행에 쓰인 계획에서 만든 칩이 해석을 정확히 반영하는지.
import { describe, expect, it } from "vitest";

import { colorwayPlanToChips } from "./colorway-chips";
import { interpretColorwayQuery } from "./colorway-interpret";
import { compileColorwayPlan } from "./colorway-plan";

const chips = (q: string) =>
  colorwayPlanToChips(compileColorwayPlan(interpretColorwayQuery(q)));

describe("colorway-chips", () => {
  it("결속 쿼리: 바탕·프린트·위치가 각각의 종류로 나온다", () => {
    expect(chips("블랙 바탕에 화이트 백프린팅")).toEqual([
      { kind: "baseColor", label: "블랙" },
      { kind: "printColor", label: "화이트" },
      { kind: "placement", label: "뒷면" },
    ]);
  });

  it("바탕색 단독: 상품 수준 칩 하나", () => {
    expect(chips("검은색 반팔")).toEqual([{ kind: "baseColor", label: "블랙" }]);
  });

  it("올오버는 사용자 언어로 표기된다", () => {
    expect(chips("올오버 프린팅 티")).toEqual([{ kind: "placement", label: "올오버" }]);
  });

  it("부정은 제외 칩으로, 존재 조건은 프린팅 있음으로", () => {
    expect(chips("검정 바탕 말고 화이트 프린팅 티")).toEqual([
      { kind: "printColor", label: "화이트" },
      { kind: "exclude", label: "블랙 바탕" },
    ]);
    expect(chips("파스텔톤 프린팅 티")).toEqual([
      { kind: "placement", label: "프린팅 있음" },
    ]);
  });

  it("복수 묶음에서 중복 값은 한 번만", () => {
    const got = chips("앞에는 흰 로고 뒤에는 빨간 캐릭터");
    expect(got).toEqual([
      { kind: "printColor", label: "화이트" },
      { kind: "placement", label: "앞면" },
      { kind: "graphic", label: "로고" },
      { kind: "printColor", label: "레드" },
      { kind: "placement", label: "뒷면" },
      { kind: "graphic", label: "캐릭터" },
    ]);
  });

  it("빈 계획이면 칩 없음", () => {
    expect(chips("빈티지한 느낌 티셔츠")).toEqual([]);
  });
});
