// 카드 호버 요약 — "이 카드가 검색 조건과 어떻게 맞는지"를 1~2초에 확인시키는 보조 신호.
// 무엇이 중요한지는 상품이 아니라 질의(칩)가 결정한다: 언급된 축을 먼저, 남는 자리만
// 기본 순서로 채우고 상단 3행에서 자른다. 리뷰 태그(착용 경험)는 항상 맨 아래에
// 접지 않고 전체 표시한다 — 이미지가 답 못 주는 정보라 자르면 가치가 준다.
// 같은 질의 안에선 모든 카드가 같은 행 구성을 가진다(비교 가능성).
// 프린트 정보는 카드에서 제외(상세 페이지 몫). 순수 함수(프레임워크 독립).
import type { Goods } from "@/features/catalog/domain/goods";
import { WEAR_AXES } from "@/features/search/domain/query-intent";
import type { ChipKind, IntentChip } from "@/features/search/domain/query-intent-chips";

export interface SummaryRow {
  label: string;
  value: string;
  /** 있으면 텍스트 한 줄 대신 칩(알약) 목록으로 렌더한다(리뷰 태그 행). */
  items?: string[];
}

type SummaryAxis = "color" | "pattern" | "fit" | "material" | "wear" | "gender";

// 기본(=언급 없음) 우선순위 — 리뷰 태그는 이 순서와 무관하게 항상 맨 아래.
const AXIS_ORDER: SummaryAxis[] = [
  "color",
  "pattern",
  "fit",
  "material",
  "wear",
  "gender",
];
const MAX_MAIN_ROWS = 3;
// 좁은 2열 카드라 축당 표시 개수를 제한하고 초과분은 +N으로 접는다(리뷰 태그 제외).
const MAX_ITEMS = 3;

// 칩 종류 → 요약 축. 바탕색은 색 축으로(프린트 결속 칩·리뷰 칩은 순서에 영향 없음).
const CHIP_AXIS: Partial<Record<ChipKind, SummaryAxis>> = {
  color: "color",
  baseColor: "color",
  pattern: "pattern",
  material: "material",
  fit: "fit",
  wear: "wear",
  gender: "gender",
};

function joinCapped(items: string[]): string {
  const clean = items.filter((s) => s.trim() !== "");
  if (clean.length === 0) return "";
  const shown = clean.slice(0, MAX_ITEMS);
  const extra = clean.length - shown.length;
  return extra > 0 ? `${shown.join(" · ")} +${extra}` : shown.join(" · ");
}

export function cardSummary(goods: Goods, chips: IntentChip[] = []): SummaryRow[] {
  const mentioned = new Set<SummaryAxis>(
    chips.flatMap((c) => {
      const axis = CHIP_AXIS[c.kind];
      return axis ? [axis] : [];
    }),
  );

  // 착용감: WEAR_AXES 순서로 "축 값" 쌍. 객체 키 순서를 믿지 않고, 미지 키·빈 값은 제외.
  const wear = WEAR_AXES.flatMap((axis) => {
    const v = goods.wearChars[axis];
    return v && v.trim() !== "" ? [`${axis} ${v}`] : [];
  });

  const valueOf: Record<SummaryAxis, () => SummaryRow | null> = {
    color: () => {
      const v = joinCapped(goods.colors);
      return v ? { label: "색", value: v } : null;
    },
    pattern: () => {
      const v = joinCapped(goods.patterns);
      return v ? { label: "패턴", value: v } : null;
    },
    fit: () => {
      const v = joinCapped(goods.fits);
      return v ? { label: "핏", value: v } : null;
    },
    material: () => {
      const v = joinCapped(goods.materials);
      return v ? { label: "소재", value: v } : null;
    },
    wear: () => {
      const v = joinCapped(wear);
      return v ? { label: "착용감", value: v } : null;
    },
    gender: () => (goods.gender ? { label: "성별", value: goods.gender } : null),
  };

  const order = [
    ...AXIS_ORDER.filter((a) => mentioned.has(a)),
    ...AXIS_ORDER.filter((a) => !mentioned.has(a)),
  ];

  const rows: SummaryRow[] = [];
  for (const axis of order) {
    if (rows.length >= MAX_MAIN_ROWS) break;
    const row = valueOf[axis]();
    if (row) rows.push(row);
  }

  // 리뷰 태그는 항상 맨 아래, 접지 않고 칩 목록으로 전체 표시.
  const reviewTags = goods.reviewTags.filter((s) => s.trim() !== "");
  if (reviewTags.length > 0)
    rows.push({ label: "리뷰", value: reviewTags.join(" · "), items: reviewTags });

  return rows;
}
