// @vitest-environment jsdom
//
// **고른 옷이 추천 요청의 입력에 실제로 들어가는가** (계획 §1-4 완료 기준).
//
// `getProfileSummary`는 개인화 믹스(`c_mix_page`)와 FOR YOU 순위(`c_curation_rank`)가
// **함께 쓰는 길목**이다. 여기서 실리면 두 곳 모두에 실린다.
//
// 초안의 완료 기준("첫 홈에 실제 추천 상품이 보인다")은 무작위 다양성 피드도
// 통과한다 — 그래서 "입력에 들어갔는가"를 직접 본다.
import { beforeEach, describe, expect, it } from "vitest";

import { SEED_FADE_ANCHORS, SEED_WEIGHT } from "@/shared/onboarding/onboarding-pick";
import { resetOnboardingStore, setPicks } from "@/shared/onboarding/onboarding-store";

import { PROFILE_SCHEMA_VERSION } from "./profile-rules";
import { getProfileSummary } from "./profile-store";

const PICKS = [
  { goodsNo: 2086653, cardPos: 0, pickSeq: 0 },
  { goodsNo: 1855624, cardPos: 3, pickSeq: 1 },
  { goodsNo: 3325849, cardPos: 9, pickSeq: 2 },
];

function writeLongTerm(anchors: { goodsNo: number; weight: number }[]): void {
  localStorage.setItem(
    "atee-profile",
    JSON.stringify({
      schemaVersion: PROFILE_SCHEMA_VERSION,
      anchors: anchors.map((a) => ({ ...a, lastMs: 0 })),
      updatedAtMs: 0,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetOnboardingStore();
});

describe("온보딩 선택이 추천 요청 입력에 들어간다", () => {
  it("행동이 없는 첫 홈에서는 고른 3개가 그대로 실린다", () => {
    setPicks(PICKS);

    const summary = getProfileSummary("s1", 0);

    expect(summary.longAnchors).toEqual([
      { goodsNo: 2086653, weight: SEED_WEIGHT },
      { goodsNo: 1855624, weight: SEED_WEIGHT },
      { goodsNo: 3325849, weight: SEED_WEIGHT },
    ]);
  });

  it("고른 것이 없으면 아무것도 더하지 않는다", () => {
    writeLongTerm([{ goodsNo: 111, weight: 2 }]);

    expect(getProfileSummary("s1", 0).longAnchors).toEqual([
      { goodsNo: 111, weight: 2 },
    ]);
  });

  it("행동 앵커와 나란히 실리되 행동이 앞에 온다", () => {
    writeLongTerm([{ goodsNo: 111, weight: 2 }]);
    setPicks(PICKS);

    const anchors = getProfileSummary("s1", 0).longAnchors;

    expect(anchors[0]).toEqual({ goodsNo: 111, weight: 2 });
    expect(anchors.map((a) => a.goodsNo)).toEqual([111, 2086653, 1855624, 3325849]);
  });

  it("같은 상품이 행동으로도 잡혔으면 두 번 싣지 않는다", () => {
    writeLongTerm([{ goodsNo: 2086653, weight: 9 }]);
    setPicks(PICKS);

    const anchors = getProfileSummary("s1", 0).longAnchors;

    expect(anchors.filter((a) => a.goodsNo === 2086653)).toHaveLength(1);
    expect(anchors[0].weight).toBe(9);
  });

  it("행동이 충분히 쌓이면 씨앗은 사라진다 — 시작점이지 종착점이 아니다", () => {
    writeLongTerm(
      Array.from({ length: SEED_FADE_ANCHORS }, (_, i) => ({
        goodsNo: 1000 + i,
        weight: 1,
      })),
    );
    setPicks(PICKS);

    const anchors = getProfileSummary("s1", 0).longAnchors;

    expect(anchors).toHaveLength(SEED_FADE_ANCHORS);
    expect(anchors.some((a) => a.goodsNo === 2086653)).toBe(false);
  });

  it("계산된 장기 취향 자체는 오염되지 않는다 — 저장은 따로 둔다", () => {
    writeLongTerm([{ goodsNo: 111, weight: 2 }]);
    setPicks(PICKS);

    getProfileSummary("s1", 0);

    const stored = JSON.parse(localStorage.getItem("atee-profile") ?? "{}") as {
      anchors: { goodsNo: number }[];
    };
    expect(stored.anchors.map((a) => a.goodsNo)).toEqual([111]);
  });
});
