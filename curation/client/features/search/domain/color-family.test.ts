// 색 계열 접기 + 바탕색→판매자 색상 매핑 검증.
// 계약: base_colors(사진 관측)는 값의 진실이 아니라 "이 원소가 어느 컬러웨이의
// 관측인지"를 잇는 매핑 키다. 값의 진실은 상품 colors(판매자 옵션).
import { describe, expect, it } from "vitest";

import { foldColorKey, mapBaseToProductColors } from "./color-family";

describe("foldColorKey — 톤·표기 접기", () => {
  it("공백과 라이트/다크 등 톤 접두를 접는다", () => {
    expect(foldColorKey("다크 그레이")).toBe("그레이");
    expect(foldColorKey("라이트핑크")).toBe("핑크");
    expect(foldColorKey("딥그린")).toBe("그린");
  });

  it("동일 계열 별칭을 대표 계열로 접는다", () => {
    expect(foldColorKey("차콜")).toBe("그레이");
    expect(foldColorKey("아이보리")).toBe("화이트");
    expect(foldColorKey("크림")).toBe("화이트");
    expect(foldColorKey("라벤더")).toBe("퍼플");
  });

  it("별개 캐논 색은 접지 않는다 — 네이비≠블루, 카키≠그린", () => {
    expect(foldColorKey("네이비")).toBe("네이비");
    expect(foldColorKey("다크 네이비")).toBe("네이비");
    expect(foldColorKey("카키")).toBe("카키");
  });

  it("확장 계열(2026-08-10, 유실 실측 기반): 라임·올리브·피치·베이지 쌍", () => {
    expect(foldColorKey("라임")).toBe("그린");
    // 올리브는 그린이 아니라 카키 쪽으로 — 카키 검색을 오염시키지 않으면서 잇는다.
    expect(foldColorKey("올리브 그린")).toBe("카키");
    expect(foldColorKey("피치")).toBe("핑크");
    // 베이지·오트밀은 브라운 계열로 수렴(다크 베이지 ↔ 브라운 실측 쌍).
    expect(foldColorKey("베이지")).toBe("브라운");
    expect(foldColorKey("오트밀")).toBe("브라운");
    expect(foldColorKey("다크 베이지")).toBe("브라운");
  });
});

describe("mapBaseToProductColors — 관측 바탕색을 판매자 색상으로 연결", () => {
  it("정확 일치를 우선하고, 없으면 같은 계열 판매자 표기로 스냅", () => {
    expect(mapBaseToProductColors(["블랙"], ["블랙", "화이트"])).toEqual(["블랙"]);
    expect(mapBaseToProductColors(["차콜"], ["다크 그레이"])).toEqual(["다크 그레이"]);
    expect(mapBaseToProductColors(["핑크"], ["라이트 핑크"])).toEqual(["라이트 핑크"]);
  });

  it("다바탕(배색) 원소는 매핑되는 색만 반환한다", () => {
    // 그레이·핑크 컬러웨이는 이 단품(colors)에 없음 — 다른 컬러웨이 관측.
    expect(
      mapBaseToProductColors(["블랙", "화이트", "그레이", "핑크"], ["블랙", "화이트"]),
    ).toEqual(["블랙", "화이트"]);
  });

  it("어느 판매자 색에도 연결되지 않으면 빈 배열(다른 컬러웨이)", () => {
    expect(mapBaseToProductColors(["블랙"], ["화이트"])).toEqual([]);
  });

  it("중복 없이 등장 순서를 유지한다", () => {
    expect(mapBaseToProductColors(["차콜", "다크그레이"], ["다크 그레이"])).toEqual([
      "다크 그레이",
    ]);
  });
});
