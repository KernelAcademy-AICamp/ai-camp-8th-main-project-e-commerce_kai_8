import { describe, expect, it } from "vitest";

import {
  CANON_COLORS,
  COLORS_STATUSES,
  DB_SIDES,
  GRAPHIC_TYPES,
  GRAPHIC_TYPES_MOTIF,
  GRAPHIC_TYPES_PATTERN,
  isCanonColor,
  isColorsStatus,
  isDbSide,
  isGraphicType,
  isPlanPlacement,
  PLAN_PLACEMENTS,
  VOCAB_VERSION,
} from "./colorway-vocab";

describe("colorway-vocab: 단일 소스 어휘 계약", () => {
  it("어휘 밖 값은 모든 가드에서 거부된다", () => {
    expect(isCanonColor("형광그린")).toBe(false);
    expect(isCanonColor("먹색")).toBe(false);
    expect(isCanonColor("")).toBe(false);
    expect(isPlanPlacement("어깨")).toBe(false);
    expect(isDbSide("전체")).toBe(false); // '전체'는 계획 전용 — DB 면이 아니다
    expect(isGraphicType("멜란지")).toBe(false); // 가공 계열은 확정 스키마에서 삭제됨
    expect(isGraphicType("피그먼트")).toBe(false);
    expect(isGraphicType("기타")).toBe(false);
    expect(isColorsStatus("불명")).toBe(false);
  });

  it("어휘 안 값은 가드를 통과한다 (타입·런타임이 같은 소스에서 파생)", () => {
    for (const c of CANON_COLORS) expect(isCanonColor(c)).toBe(true);
    for (const p of PLAN_PLACEMENTS) expect(isPlanPlacement(p)).toBe(true);
    for (const s of DB_SIDES) expect(isDbSide(s)).toBe(true);
    for (const g of GRAPHIC_TYPES) expect(isGraphicType(g)).toBe(true);
    for (const st of COLORS_STATUSES) expect(isColorsStatus(st)).toBe(true);
  });

  it("이름공간: 계획 전용 '전체'는 위치에만 있고 DB 면에는 없다", () => {
    expect(PLAN_PLACEMENTS).toContain("전체");
    expect(DB_SIDES).not.toContain("전체");
    expect([...PLAN_PLACEMENTS].filter((p) => p !== "전체")).toEqual([...DB_SIDES]);
  });

  it("그래픽 유형은 도안 4 + 무늬 8 = 12개로 고정", () => {
    expect(GRAPHIC_TYPES_MOTIF).toHaveLength(4);
    expect(GRAPHIC_TYPES_PATTERN).toHaveLength(8);
    expect(GRAPHIC_TYPES).toHaveLength(12);
    expect(new Set(GRAPHIC_TYPES).size).toBe(12);
    expect(GRAPHIC_TYPES).toEqual([...GRAPHIC_TYPES_MOTIF, ...GRAPHIC_TYPES_PATTERN]);
  });

  it("잉크색 상태는 4개로 고정", () => {
    expect(COLORS_STATUSES).toEqual(["확인", "없음", "판독불가", "미촬영"]);
  });

  it("어휘 버전이 조회 가능하고 내용에 결정적이다", () => {
    expect(VOCAB_VERSION).toMatch(/^colorway-vocab@[0-9a-f]{8}$/);
  });

  it("실데이터·골든셋에서 관측된 색이 캐논에 포함된다", () => {
    for (const c of [
      "블랙",
      "화이트",
      "차콜",
      "라이트그레이",
      "스카이블루",
      "카키",
      "백염",
    ]) {
      expect(isCanonColor(c)).toBe(true);
    }
  });
});
