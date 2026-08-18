// 결정성 게이트(설계 §5) — 같은 쿼리에 서로 다른 LLM intent가 와도(호스팅 추론의
// 서버측 비결정성) 후보 집합이 흔들리지 않아야 한다. 실 LLM 반복 호출은 flaky라
// CI 밖 E2E로 분리하고, 여기서는 §1 요동 실측(263↔16↔2건)을 본뜬 fixture를 주입해
// 후보 하드 계획의 결정성 키를 비교한다.
import { describe, expect, it } from "vitest";

import { candidatePlanKey } from "@/features/search/data/candidate-calls";
import { EMPTY_INTENT, type QueryIntent } from "@/features/search/domain/query-intent";
import { buildQueryPlan } from "@/features/search/domain/query-plan";
import { resolveIntent } from "@/features/search/domain/resolved-intent";

// 쿼리: "2만원 이하 가성비… 바람 슝슝… 그림 간지…" (설계 §1 실측)
// 결정적 추출 결과(쿼리 원문의 함수 — fixture와 무관하게 동일): 명시 가격 2만원.
const DETERMINISTIC = { priceMax: 20000 };

// §1 실측의 4가지 LLM 요동 패턴.
const LLM_FIXTURES: { name: string; intent: QueryIntent }[] = [
  {
    name: "1·2회: 깨끗(스타일 없음)",
    intent: { ...EMPTY_INTENT, ...DETERMINISTIC },
  },
  {
    name: "3회: 블랙+패턴 3종+오버핏 환각",
    intent: {
      ...EMPTY_INTENT,
      ...DETERMINISTIC,
      style: {
        ...EMPTY_INTENT.style,
        colors: ["블랙"],
        patterns: ["로고/그래픽", "드로잉", "그라데이션"],
        fits: ["오버"],
      },
    },
  },
  {
    name: "4회: 패턴 9종+슬림·오버 환각",
    intent: {
      ...EMPTY_INTENT,
      ...DETERMINISTIC,
      style: {
        ...EMPTY_INTENT.style,
        patterns: [
          "로고/그래픽",
          "드로잉",
          "그라데이션",
          "스트라이프",
          "컬러블록",
          "플라워",
          "카모플라쥬",
          "단색",
          "프린트",
        ],
        fits: ["슬림", "오버"],
      },
    },
  },
  {
    name: "변형: 배제 환각(옐로우 빼기)+성별 환각",
    intent: {
      ...EMPTY_INTENT,
      ...DETERMINISTIC,
      gender: "남성",
      exclude: { ...EMPTY_INTENT.exclude, colors: ["옐로우"] },
    },
  },
];

function keys(decisive: boolean): string[] {
  return LLM_FIXTURES.map(({ intent }) =>
    candidatePlanKey(
      buildQueryPlan(resolveIntent({ intent, explicitPrice: true }), { decisive })
        .candidate,
    ),
  );
}

describe("결정성 게이트 — 후보 하드 계획 해시", () => {
  it("flag-off 기준선: LLM 요동이 후보 계획을 바꾼다(현행 — cutover 후 사라져야 할 대상)", () => {
    // ⚠️ 이 테스트는 현행의 문제를 '기록'한다. 3b 원자적 cutover(flag 상시 on) 후에는
    // flag-off 경로 자체가 제거되면서 이 기준선도 함께 폐기된다.
    expect(new Set(keys(false)).size).toBeGreaterThan(1);
  });

  it("flag-on: 어떤 LLM fixture가 와도 후보 하드 계획 해시가 동일하다", () => {
    const ks = keys(true);
    expect(new Set(ks).size).toBe(1);
  });

  it("flag-on 결정성은 결정적 추출 결과에는 민감하다(가격이 다르면 계획도 다르다 — 신호 왜곡 아님)", () => {
    const a = candidatePlanKey(
      buildQueryPlan(
        resolveIntent({
          intent: { ...EMPTY_INTENT, priceMax: 20000 },
          explicitPrice: true,
        }),
        { decisive: true },
      ).candidate,
    );
    const b = candidatePlanKey(
      buildQueryPlan(
        resolveIntent({
          intent: { ...EMPTY_INTENT, priceMax: 30000 },
          explicitPrice: true,
        }),
        { decisive: true },
      ).candidate,
    );
    expect(a).not.toBe(b);
  });
});
