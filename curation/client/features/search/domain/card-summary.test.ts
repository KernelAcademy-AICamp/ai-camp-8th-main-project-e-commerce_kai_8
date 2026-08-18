// 카드 호버 요약 — 검색 의도(칩)에 따라 행 구성·순서가 달라진다.
// 같은 질의 안에서는 모든 카드가 같은 행 구성을 가진다(비교 가능성 유지).
// 프린트 정보는 카드에서 제외(상세 페이지 몫). 리뷰 태그는 항상 맨 아래에 전체 표시.
import { describe, expect, it } from "vitest";

import type { Goods } from "@/features/catalog/domain/goods";
import type { IntentChip } from "@/features/search/domain/query-intent-chips";

import { cardSummary } from "./card-summary";

function goods(overrides: Partial<Goods> = {}): Goods {
  return {
    goodsNo: "1",
    styleKey: "",
    title: "티셔츠",
    brand: "브랜드",
    category: "반팔티",
    gender: "",
    colors: [],
    patterns: [],
    materials: [],
    fits: [],
    sizes: [],
    sizeFree: false,
    sizeStd: [],
    price: 10000,
    reviewCount: 0,
    reviewScore: 0,
    gallery: [],
    url: "",
    thumbnail: "",
    wearChars: {},
    reviewTags: [],
    sizeMeasures: [],
    ...overrides,
  };
}

const full = () =>
  goods({
    colors: ["블랙", "화이트"],
    patterns: ["레터링"],
    fits: ["오버핏"],
    materials: ["코튼"],
    wearChars: { 두께: "두꺼움" },
    gender: "남성",
    reviewTags: ["데일리", "신축성좋음", "도톰함", "운동복"],
  });

const chip = (kind: IntentChip["kind"], label = "x"): IntentChip => ({ kind, label });

describe("cardSummary — 기본(질의 신호 없음)", () => {
  it("색→패턴→핏 최대 3행 + 리뷰는 맨 아래", () => {
    const rows = cardSummary(full());
    expect(rows.map((r) => r.label)).toEqual(["색", "패턴", "핏", "리뷰"]);
  });

  it("리뷰 태그는 접지 않고 칩 목록으로 전부 보여준다", () => {
    const rows = cardSummary(full());
    expect(rows.at(-1)).toEqual({
      label: "리뷰",
      value: "데일리 · 신축성좋음 · 도톰함 · 운동복",
      items: ["데일리", "신축성좋음", "도톰함", "운동복"],
    });
  });

  it("값이 없는 축은 생략", () => {
    const rows = cardSummary(goods({ colors: ["화이트"] }));
    expect(rows).toEqual([{ label: "색", value: "화이트" }]);
  });

  it("모든 축이 비면 빈 배열(오버레이 미표시)", () => {
    expect(cardSummary(goods())).toEqual([]);
  });
});

describe("cardSummary — 검색 의도 반영", () => {
  it("언급된 축이 먼저 온다 — 착용감·핏 질의", () => {
    const rows = cardSummary(full(), [
      chip("wear", "두께 두꺼움"),
      chip("fit", "오버핏"),
    ]);
    expect(rows.map((r) => r.label)).toEqual(["핏", "착용감", "색", "리뷰"]);
  });

  it("소재 질의면 소재가 먼저", () => {
    const rows = cardSummary(full(), [chip("material", "코튼")]);
    expect(rows.map((r) => r.label)[0]).toBe("소재");
  });

  it("리뷰 질의여도 리뷰는 맨 아래 고정(전체 표시가 이미 답)", () => {
    const rows = cardSummary(full(), [chip("review", "신축성좋음")]);
    expect(rows.map((r) => r.label).at(-1)).toBe("리뷰");
  });

  it("색 질의(바탕색 포함)면 색이 먼저", () => {
    const rows = cardSummary(full(), [chip("baseColor", "블랙")]);
    expect(rows.map((r) => r.label)[0]).toBe("색");
  });

  it("성별 질의면 성별이 상단 3행 안에 들어온다", () => {
    const rows = cardSummary(full(), [chip("gender", "남성")]);
    expect(rows.map((r) => r.label).slice(0, 3)).toContain("성별");
    expect(rows).toHaveLength(4);
  });

  it("알 수 없는 칩 종류는 무시하고 기본 순서", () => {
    const rows = cardSummary(full(), [chip("brand"), chip("price")]);
    expect(rows.map((r) => r.label)).toEqual(["색", "패턴", "핏", "리뷰"]);
  });
});

describe("cardSummary — 값 표시 규칙(기존 유지)", () => {
  it("배열이 3개를 넘으면 +N으로 생략", () => {
    const rows = cardSummary(
      goods({ colors: ["블랙", "화이트", "네이비", "그레이", "베이지"] }),
    );
    expect(rows[0].value).toBe("블랙 · 화이트 · 네이비 +2");
  });

  it("착용감은 WEAR_AXES 순서로, 미지 키·빈 값은 제외", () => {
    const rows = cardSummary(
      goods({
        wearChars: { 신축성: "높음", 촉감: "부드러움", 계절: "", 알수없음: "x" },
      }),
    );
    const wearRow = rows.find((r) => r.label === "착용감");
    expect(wearRow?.value).toBe("촉감 부드러움 · 신축성 높음");
  });

  it("공백 문자열 값은 무시", () => {
    expect(cardSummary(goods({ colors: ["", "  "], fits: ["레귤러핏"] }))).toEqual([
      { label: "핏", value: "레귤러핏" },
    ]);
  });
});
