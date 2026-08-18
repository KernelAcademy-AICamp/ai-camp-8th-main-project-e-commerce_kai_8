// 진리표 8케이스 — 합성 상품·객체 fixture로 결속 의미를 검증한다(계획 5단계).
// 구조 검사가 아니라 "판정 결과"를 검사한다. 이 판정기가 jsonb 어댑터의 의미 기준이 된다.
import { describe, expect, it } from "vitest";

import { evaluateColorwayPlan } from "./colorway-evaluate";
import { interpretColorwayQuery } from "./colorway-interpret";
import { compileColorwayPlan } from "./colorway-plan";

const plan = (q: string) => compileColorwayPlan(interpretColorwayQuery(q));

// GRBC형 합성 상품: 컬러웨이마다 잉크색이 다르다 — 교차 매칭의 킬러 케이스.
const grbcLike = {
  goods_no: 100,
  colors: ["화이트", "블랙", "그레이"],
  prints: [
    {
      base_colors: ["화이트"],
      sides: ["앞"],
      graphic_types: ["레터링"],
      colors: ["그린"],
      colors_status: "확인",
    },
    {
      base_colors: ["블랙"],
      sides: ["앞"],
      graphic_types: ["레터링"],
      colors: ["화이트"],
      colors_status: "확인",
    },
    {
      base_colors: ["그레이"],
      sides: ["앞"],
      graphic_types: ["레터링"],
      colors: ["네이비"],
      colors_status: "확인",
    },
  ],
};

const frontBackProduct = {
  goods_no: 200,
  colors: ["블랙"],
  prints: [
    {
      base_colors: ["블랙"],
      sides: ["앞"],
      graphic_types: ["로고"],
      colors: ["화이트"],
      colors_status: "확인",
    },
    {
      base_colors: ["블랙"],
      sides: ["뒤"],
      graphic_types: ["캐릭터"],
      colors: ["레드"],
      colors_status: "확인",
    },
  ],
};

const frontOnlyProduct = {
  goods_no: 201,
  colors: ["블랙"],
  prints: [
    {
      base_colors: ["블랙"],
      sides: ["앞"],
      graphic_types: ["로고"],
      colors: ["화이트"],
      colors_status: "확인",
    },
  ],
};

const unreadableProduct = {
  goods_no: 300,
  colors: ["블랙"],
  prints: [
    {
      base_colors: ["블랙"],
      sides: ["뒤"],
      graphic_types: ["레터링"],
      colors: null,
      colors_status: "판독불가",
    },
  ],
};

const notPhotographedProduct = {
  goods_no: 301,
  colors: ["블랙", "백염"],
  prints: [
    {
      base_colors: ["블랙"],
      sides: ["앞"],
      graphic_types: ["로고"],
      colors: ["그린"],
      colors_status: "확인",
    },
    {
      base_colors: ["백염"],
      sides: ["앞"],
      graphic_types: ["로고"],
      colors: null,
      colors_status: "미촬영",
    },
  ],
};

// 소매 배색: 무늬 전용 객체는 sides=[] — '소매 프린팅'을 오염시키면 안 된다.
const sleevePatternOnly = {
  goods_no: 400,
  colors: ["화이트"],
  prints: [
    {
      base_colors: ["화이트"],
      sides: [],
      graphic_types: ["배색"],
      colors: [],
      colors_status: "없음",
    },
  ],
};

const sleeveLogoProduct = {
  goods_no: 401,
  colors: ["블랙"],
  prints: [
    {
      base_colors: ["블랙"],
      sides: ["소매"],
      graphic_types: ["로고"],
      colors: ["화이트"],
      colors_status: "확인",
    },
  ],
};

const allOverProduct = {
  goods_no: 500,
  colors: ["그린"],
  prints: [
    {
      base_colors: ["그린"],
      sides: ["소매", "앞", "뒤"],
      graphic_types: ["그래픽"],
      colors: ["화이트"],
      colors_status: "확인",
    },
  ],
};

const plainProduct = { goods_no: 600, colors: ["블랙", "화이트"], prints: [] };

const multiMatchProduct = {
  goods_no: 700,
  colors: ["블랙"],
  prints: [
    {
      base_colors: ["블랙"],
      sides: ["앞"],
      graphic_types: ["레터링"],
      colors: ["화이트"],
      colors_status: "확인",
    },
    {
      base_colors: ["블랙"],
      sides: ["뒤"],
      graphic_types: ["로고"],
      colors: ["화이트"],
      colors_status: "확인",
    },
  ],
};

// 배색 라벨: 한 객체가 여러 바탕색을 공유한다(실데이터 — 컬러웨이 공통 프린트).
const multiBaseProduct = {
  goods_no: 800,
  colors: ["블랙", "화이트"],
  prints: [
    {
      base_colors: ["블랙", "화이트", "그레이", "핑크"],
      sides: ["앞"],
      graphic_types: ["로고"],
      colors: ["화이트"],
      colors_status: "확인",
    },
  ],
};

const ALL = [
  grbcLike,
  multiBaseProduct,
  frontBackProduct,
  frontOnlyProduct,
  unreadableProduct,
  notPhotographedProduct,
  sleevePatternOnly,
  sleeveLogoProduct,
  allOverProduct,
  plainProduct,
  multiMatchProduct,
];

describe("colorway-evaluate: 진리표 8케이스", () => {
  it("T1 동일 객체 일치: 블랙 바탕 화이트 프린팅 → 블랙 컬러웨이에 화이트 잉크가 있는 상품", () => {
    const got = evaluateColorwayPlan(ALL, plan("블랙 바탕에 화이트 프린팅"));
    expect(got).toContain(100); // 블랙 컬러웨이 객체의 잉크가 화이트
    expect(got).toContain(200);
  });

  it("T2 교차 매칭 거부: 블랙 바탕 그린 프린팅 → 그린 잉크는 화이트 컬러웨이에만 있으므로 불일치", () => {
    const got = evaluateColorwayPlan(ALL, plan("블랙 바탕에 그린 프린팅"));
    expect(got).not.toContain(100);
    const white = evaluateColorwayPlan(ALL, plan("화이트 바탕에 그린 프린팅"));
    expect(white).toContain(100);
  });

  it("T3 두 개 PrintClause: 앞 흰 로고 + 뒤 빨간 캐릭터 → 둘 다 가진 상품만", () => {
    const got = evaluateColorwayPlan(ALL, plan("앞에는 흰 로고 뒤에는 빨간 캐릭터"));
    expect(got).toContain(200);
    expect(got).not.toContain(201); // 앞 로고만 있는 상품은 탈락
  });

  it("T4 판독불가·미촬영 잉크색 거부: 잉크색 조건은 확인 상태에서만 성립", () => {
    const got = evaluateColorwayPlan(ALL, plan("블랙 바탕에 화이트 백프린팅"));
    expect(got).not.toContain(300); // 판독불가(null)
    const inferred = evaluateColorwayPlan(ALL, plan("백염 바탕에 그린 프린팅"));
    expect(inferred).not.toContain(301); // 미촬영 컬러웨이의 잉크색은 검색 불가
    // 단, 구조(위치) 검색은 판독불가 관측 범위에서 가능하다(설계 §2.3).
    const structural = evaluateColorwayPlan(ALL, plan("백프린팅 티셔츠"));
    expect(structural).toContain(300);
  });

  it("T5 sides=[] 거부: 무늬 전용 객체는 소매 프린팅 검색을 오염시키지 않는다", () => {
    const got = evaluateColorwayPlan(ALL, plan("소매 프린팅 있는 티"));
    expect(got).not.toContain(400);
    expect(got).toContain(401);
    expect(got).toContain(500); // 올오버(소매 포함)는 일치
  });

  it("T6 올오버: 앞·뒤·소매가 모두 포함된 객체만(순서 무관)", () => {
    const got = evaluateColorwayPlan(ALL, plan("올오버 프린팅 티"));
    expect(got).toEqual([500]);
  });

  it("T7 바탕색 단독: 상품 수준 옷 색 — 무지 상품도 포함된다", () => {
    const got = evaluateColorwayPlan(ALL, plan("블랙 티셔츠"));
    expect(got).toContain(600); // 무지(prints=[])
    expect(got).toContain(100);
    expect(got).not.toContain(500); // 그린 단독 상품
  });

  it("T8 복수 객체 일치 → 상품 1건", () => {
    const got = evaluateColorwayPlan(ALL, plan("블랙 바탕에 화이트 프린팅"));
    expect(got.filter((g) => g === 700)).toHaveLength(1);
  });

  it("부정: 검정 바탕 말고 화이트 프린팅 → 블랙 컬러웨이 객체로는 성립 불가", () => {
    const got = evaluateColorwayPlan(ALL, plan("검정 바탕 말고 화이트 프린팅 티"));
    expect(got).not.toContain(200); // 블랙 단일 컬러웨이 → 잔여 컬러웨이 없음
    // 상품 100의 화이트 잉크는 블랙 컬러웨이에만 있다 → 블랙 배제 시 결속 성립 불가.
    // 부정이 상품 수준이 아니라 결속 객체 수준에도 적용된다는 증거.
    expect(got).not.toContain(100);
    expect(got).toContain(500); // 그린 컬러웨이 + 화이트 잉크 → 성립
  });

  it("배색 라벨(다바탕 원소): 판매자 colors에 매핑되는 바탕색으로만 결속이 성립한다", () => {
    expect(evaluateColorwayPlan(ALL, plan("블랙 바탕에 화이트 로고 티"))).toContain(
      800,
    );
    // 핑크는 라벨엔 있지만 이 단품 colors(블랙·화이트)에 없다 — 다른 컬러웨이 관측.
    expect(evaluateColorwayPlan(ALL, plan("핑크 바탕 로고 티"))).not.toContain(800);
    // 부정: 블랙을 빼도 다른 바탕색(화이트 등)으로 결속이 남는다 — 원소를 통째로 버리지 않는다.
    expect(
      evaluateColorwayPlan(ALL, plan("검정 바탕 말고 화이트 프린팅 티")),
    ).toContain(800);
  });

  it("바탕색은 매핑 키(2026-08-10): 라벨 차콜 + 판매자 다크 그레이 → 그레이 바탕으로 성립", () => {
    const charcoal = {
      goods_no: 900,
      colors: ["다크 그레이"],
      prints: [
        {
          base_colors: ["차콜"],
          sides: ["앞"],
          graphic_types: ["레터링"],
          colors: ["화이트"],
          colors_status: "확인",
        },
      ],
    };
    const got = evaluateColorwayPlan(
      [charcoal],
      plan("그레이 바탕에 화이트 레터링 티"),
    );
    expect(got).toEqual([900]);
  });

  it("colors에 연결되지 않는 원소(다른 컬러웨이 관측)는 결속에 쓰지 않는다", () => {
    // 화이트 단품인데 라벨은 블랙 컬러웨이 사진을 관측 — 이 단품의 근거가 아니다.
    const otherColorway = {
      goods_no: 901,
      colors: ["화이트"],
      prints: [
        {
          base_colors: ["블랙"],
          sides: ["앞"],
          graphic_types: ["로고"],
          colors: ["레드"],
          colors_status: "확인",
        },
      ],
    };
    expect(
      evaluateColorwayPlan([otherColorway], plan("블랙 바탕에 빨간 로고 티")),
    ).toEqual([]);
    expect(evaluateColorwayPlan([otherColorway], plan("빨간 로고 티"))).toEqual([]);
  });

  it("빈 계획: 조건이 없으면 아무 상품도 필터하지 않는다(기존 경로 보존 신호)", () => {
    const p = plan("빈티지한 느낌 티셔츠");
    expect(p.printClauses).toHaveLength(0);
    expect(p.productBaseColors).toHaveLength(0);
  });
});
