// 지표 계약이 SQL에 실제로 반영됐는지 고정한다.
// 정의: docs/atee/living/session-metrics.md §7
//
// 실제 숫자가 맞는지는 여기서 못 본다(DB가 있어야 한다). 대신 **계약을 어기는
// 코드 모양**을 잡는다 — 평균으로 되돌아가거나, 사분위 방식이 바뀌거나,
// 퍼널 분모가 다시 상품 수가 되는 것.

import { describe, expect, it } from "vitest";

import { activeDays } from "./active-days";
import { returnCurve } from "./return-curve";
import { sessionFunnel } from "./session-funnel";
import { sessionSummary } from "./session-summary";

describe("세션 요약 — 대표값 계약", () => {
  it("중앙값과 사분위를 연속 백분위수로 낸다", () => {
    // 방식을 안 정하면 같은 표본에서 세 가지 답이 나온다 (§7)
    expect(sessionSummary.sql).toContain("percentile_cont");
  });

  it("이산 백분위수를 쓰지 않는다", () => {
    expect(sessionSummary.sql).not.toContain("percentile_disc");
  });

  it("평균을 대표값 자리에 두지 않는다", () => {
    // 평균은 참고값으로만 남는다. 컬럼 이름에 그렇게 적혀 있어야 한다.
    const 평균컬럼 = /as\s+"[^"]*평균[^"]*"/g;
    for (const m of sessionSummary.sql.match(평균컬럼) ?? []) {
      expect(m).toContain("참고");
    }
  });
});

describe("퍼널 — 세션률 계약", () => {
  it("분모가 세션 수다", () => {
    // 상품 수로 세면 한 세션의 폭주가 비율을 지배한다 (§7)
    expect(sessionFunnel.sql).toContain("count(*) filter");
  });

  it("상품 수를 분모로 쓰지 않는다", () => {
    expect(sessionFunnel.sql).not.toMatch(/sum\(노출개\)/);
  });

  it("분자와 분모를 함께 보여준다", () => {
    // 비율만 있으면 표본이 몇인지 몰라 해석할 수 없다
    expect(sessionFunnel.sql).toMatch(/as\s+"분모"/);
  });
});

describe("재방문 곡선 — 계약", () => {
  it("첫 활동일 기준으로 며칠째인지 센다", () => {
    // 달력 주가 아니라 각 기기의 첫날부터 끊어야 시작일이 다른 기기를
    // 같은 기준으로 비교할 수 있다
    expect(returnCurve.sql).toContain("첫날");
  });

  it("분자와 분모를 함께 보여준다", () => {
    expect(returnCurve.sql).toMatch(/as\s+"기준 기기"/);
  });

  it("습관 단계로 판정하지 않는다", () => {
    // 습관 판정선("주 2일이면 습관")은 근거 없이 정할 수 없다. 사실만 내고
    // 해석은 사람이 한다. 컬럼 이름에 단계가 등장하면 그 순간 결론이 된다.
    const 컬럼 = returnCurve.sql.match(/as\s+"([^"]+)"/g) ?? [];
    expect(컬럼.join(" ")).not.toMatch(/습관|형성|강화|정착/);
  });
});

describe("활동 일수 분포 — 계약", () => {
  it("활동일은 클릭이 있었던 날로 센다", () => {
    // 스크롤만 한 날은 세지 않는다 — 개인화가 배울 신호가 없다
    expect(activeDays.sql).toContain("'tap'");
  });

  it("같은 날 여러 번 열어도 하루로 센다", () => {
    expect(activeDays.sql).toMatch(/::date/);
  });

  it("습관 단계로 판정하지 않는다", () => {
    const 컬럼 = activeDays.sql.match(/as\s+"([^"]+)"/g) ?? [];
    expect(컬럼.join(" ")).not.toMatch(/습관|형성|강화|정착/);
  });
});
