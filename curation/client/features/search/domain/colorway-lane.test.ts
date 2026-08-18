// 통합 지점 검증 4종(계획 7단계):
//  ① 꺼짐: 신규 해석·실행이 호출되지 않는다(route는 isColorwayLaneOn 가드 뒤에서만 lane을 만든다).
//  ② 켜짐: 컴파일된 계획이 실행기에 그대로 전달된다.
//  ③ 해석기가 소비한 표현이 제목 토큰으로 재유입되지 않는다(D4 조건 소유권).
//  ④ 실행기 실패 시 정의된 폴백 — 요청 실패가 아니라 필터 미적용.
import { describe, expect, it, vi } from "vitest";

import {
  applyColorwayMatches,
  type ColorwayExecutor,
  isColorwayLaneOn,
  prepareColorwayLane,
  runColorwayLane,
} from "./colorway-lane";
import { extractTitleTokens } from "./extract-title-tokens";

describe("colorway-lane: 통합 지점", () => {
  it("① 스위치 기본 꺼짐 — 명시적 on일 때만 켜진다(기존 스위치와 별개 축)", () => {
    expect(isColorwayLaneOn({})).toBe(false);
    expect(isColorwayLaneOn({ SEARCH_COLORWAY_LANE: "off" })).toBe(false);
    expect(isColorwayLaneOn({ SEARCH_DECISIVE_LANE: "on" })).toBe(false); // D3: 재사용 금지
    expect(isColorwayLaneOn({ SEARCH_COLORWAY_LANE: "on" })).toBe(true);
  });

  it("① 아무것도 소비하지 않은 쿼리만 lane이 null — 기존 경로 그대로", () => {
    expect(prepareColorwayLane("나이키 오버핏 10만원 이하")).toBeNull();
    // 미해결만 있는 쿼리는 계획은 비지만 lane은 유지 — 소비 표현이 제목 필터로 새지 않게(D4).
    const lane = prepareColorwayLane("빈티지한 느낌 티셔츠");
    expect(lane).not.toBeNull();
    expect(lane?.plan.printClauses).toHaveLength(0);
    expect(lane?.plan.productBaseColors).toHaveLength(0);
    expect(lane?.consumedTokens).toContain("빈티지한");
    expect(lane?.unresolved).toContain("빈티지한 느낌");
  });

  it("② 켜짐: 컴파일된 계획이 실행기에 그대로 전달된다", async () => {
    const lane = prepareColorwayLane("블랙 바탕에 화이트 백프린팅");
    expect(lane).not.toBeNull();
    if (!lane) return;

    const executor = vi.fn<ColorwayExecutor>().mockResolvedValue(new Set([6660007]));
    const matched = await runColorwayLane(executor, lane);

    expect(executor).toHaveBeenCalledTimes(1);
    const passed = executor.mock.calls[0][0];
    expect(passed).toBe(lane.plan);
    expect(passed.printClauses).toHaveLength(1);
    expect(passed.printClauses[0]).toMatchObject({
      baseColors: ["블랙"],
      printColors: ["화이트"],
      placements: ["뒤"],
    });
    expect(matched).toEqual(new Set([6660007]));
  });

  it("③ 소비 표현은 제목 토큰으로 재유입되지 않는다", () => {
    const query = "블랙 바탕에 화이트 백프린팅 반스 티셔츠";
    // 레인 없이: '백프린팅'이 제목 하드필터로 새는 것이 현행 동작(codex 리뷰에서 실측된 누수).
    expect(extractTitleTokens(query, [])).toContain("백프린팅");

    const lane = prepareColorwayLane(query);
    expect(lane).not.toBeNull();
    if (!lane) return;
    const tokens = extractTitleTokens(query, lane.consumedTokens);
    expect(tokens).not.toContain("백프린팅");
    expect(tokens).not.toContain("바탕에");
    expect(tokens).not.toContain("바탕"); // 조사 스트립 후 형태도 새면 안 된다
    // 소비되지 않은 표현(반스)은 기존 경로가 그대로 처리한다.
    expect(tokens).toContain("반스");
  });

  it("④ 실행기 실패 → null 폴백, 결과는 필터 미적용 그대로", async () => {
    const lane = prepareColorwayLane("블랙 바탕에 화이트 프린팅");
    expect(lane).not.toBeNull();
    if (!lane) return;

    const failing = vi.fn<ColorwayExecutor>().mockRejectedValue(new Error("db down"));
    const matched = await runColorwayLane(failing, lane);
    expect(matched).toBeNull();

    const results = [{ goodsNo: "1" }, { goodsNo: "2" }];
    expect(applyColorwayMatches(results, matched)).toEqual(results);
  });

  it("교집합 적용: matched 집합에 있는 상품만 남는다(상품당 1건 유지)", () => {
    const results = [
      { goodsNo: "6660007" },
      { goodsNo: "4957286" },
      { goodsNo: "9999" },
    ];
    const out = applyColorwayMatches(results, new Set([6660007, 4957286]));
    expect(out.map((g) => g.goodsNo)).toEqual(["6660007", "4957286"]);
  });
});
