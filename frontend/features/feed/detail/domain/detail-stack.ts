import type { Product } from "@/features/feed/domain/product";

/** 카드 확대 전환의 시작 위치 (뷰포트 기준) */
export interface OriginRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** 상세 체인 스택의 한 레벨 */
export interface DetailEntry {
  product: Product;
  originRect: OriginRect | null;
  phase: "open" | "closing";
  /** 이 레벨을 떠날 때 저장한 스크롤 위치 — 복귀 시 복원 */
  savedScrollTop: number;
  /** 위 레벨이 닫혀 다시 드러난 상태 — 확대 애니메이션을 다시 틀지 않는다 */
  revealed: boolean;
}

/** 현재 최상단의 스크롤 위치를 저장하고 새 상세를 스택 위에 쌓는다. */
export function pushDetail(
  stack: readonly DetailEntry[],
  product: Product,
  originRect: OriginRect | null,
  currentScrollTop: number,
): DetailEntry[] {
  const saved = stack.map((entry, i) =>
    i === stack.length - 1 ? { ...entry, savedScrollTop: currentScrollTop } : entry,
  );
  return [
    ...saved,
    { product, originRect, phase: "open", savedScrollTop: 0, revealed: false },
  ];
}

/** 최상단을 닫는 중 상태로 바꾼다. 빈 스택이면 그대로. */
export function markTopClosing(stack: readonly DetailEntry[]): DetailEntry[] {
  return stack.map((entry, i) =>
    i === stack.length - 1 ? { ...entry, phase: "closing" as const } : entry,
  );
}

/** 닫힘이 끝난 최상단을 제거하고, 드러난 레벨에 복귀를 표시한다. */
export function popDetail(stack: readonly DetailEntry[]): DetailEntry[] {
  const rest = stack.slice(0, -1);
  return rest.map((entry, i) =>
    i === rest.length - 1 ? { ...entry, revealed: true } : entry,
  );
}
