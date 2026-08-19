// 상세 화면과 브라우저 히스토리를 잇는 순수 규칙.
//
// 상세는 주소가 없는 전체 화면 덮개라, 열 때마다 주소가 같은 히스토리 항목을
// 하나 만들어 둔다. 그래야 뒤로가기 제스처가 앱을 떠나는 대신 덮개만 닫는다.
//
// ⚠️ 예전에는 "몇 겹이 열려 있는가"를 화면 쪽 기억에만 뒀다. **히스토리 항목은
// 그 기억보다 오래 산다** — 뒤로가기로 기억이 지워져도, 새로고침이나 앱 재기동을
// 건너뛰어도 항목은 남는다. 그래서 둘이 어긋나면 앞으로가기가 삼켜지고, 화면은
// 피드인데 히스토리상으로는 상세인 **고아 항목**이 영구히 끼어들었다.
// 지금은 그 사실을 항목 자체에 실어 수명을 맞춘다.

import type { DetailEntry } from "@/features/feed/detail/domain/detail-stack";
import type { Product } from "@/features/feed/domain/product";
import { readEntryValue, withEntryValue } from "@/shared/history/history-state";

const MARK_KEY = "aTeeDetail";

/** 히스토리 항목 하나에 실리는 표식 — 이 자리에서 어떤 상세가 몇 번째로 열려 있는가 */
export interface DetailMark {
  /**
   * 이 상세를 연 화면. 홈은 BROWSE와 FOR YOU가 **하나의 히스토리를 함께 쓰므로**,
   * 주인을 적어 두지 않으면 뒤로가기 한 번에 두 화면이 함께 닫힌다.
   */
  owner: string;
  /** 1부터 세는 깊이 */
  level: number;
  product: Product;
}

/** 히스토리 항목 상태에서 내 표식을 읽는다. 내 것이 아니거나 알 수 없는 값이면 null. */
export function readDetailMark(state: unknown, owner: string): DetailMark | null {
  const raw = readEntryValue(state, MARK_KEY);
  if (typeof raw !== "object" || raw === null) return null;
  // 값 하나하나를 unknown으로 두고 확인한다. 통째로 DetailMark라고 단언하면
  // 지난 배포가 남긴 옛 모양이나 손댄 값이 그대로 통과한다.
  const mark = raw as Record<string, unknown>;
  if (mark.owner !== owner) return null;
  const level = mark.level;
  if (typeof level !== "number" || level < 1) return null;
  const product = mark.product;
  if (typeof product !== "object" || product === null) return null;
  return { owner, level, product: product as Product };
}

/**
 * 표식을 얹은 새 히스토리 상태를 만든다.
 *
 * ⚠️ **기존 값을 지우지 않는다.** 이 자리에는 Next.js 라우터가 자기 트리를 적어
 * 두는데, 통째로 갈아치우면 화면 간 이동이 깨진다.
 */
export function withDetailMark(
  state: unknown,
  mark: DetailMark,
): Record<string, unknown> {
  return withEntryValue(state, MARK_KEY, mark);
}

/** 되맞춤 지시 */
export type Reconcile =
  | { kind: "none" }
  /** 한 겹만 물러났다 — 닫힘 애니메이션을 태운다 */
  | { kind: "closeTop" }
  /** 그 밖의 이동 — 애니메이션 없이 즉시 맞춘다 */
  | { kind: "settle"; stack: DetailEntry[] };

/** 카드 위치를 모르는 채 되살린 겹 — 확대 애니메이션 없이 그냥 나타난다 */
function restored(product: Product): DetailEntry {
  return {
    product,
    originRect: null,
    phase: "open",
    savedScrollTop: 0,
    revealed: true,
  };
}

/**
 * 표식이 말하는 겹 하나짜리 스택. 아는 겹이 하나도 없을 때 쓴다 —
 * 재기동 직후이거나, 되살린 한 겹을 닫아 그 아래가 드러날 때다.
 */
export function restoredStack(mark: DetailMark | null): DetailEntry[] {
  return mark === null ? [] : [restored(mark.product)];
}

/** 걷어내고 남은 최상단은 다시 드러난 상태다 */
function revealTop(stack: readonly DetailEntry[]): DetailEntry[] {
  return stack.map((entry, i) =>
    i === stack.length - 1
      ? { ...entry, phase: "open" as const, revealed: true }
      : entry,
  );
}

/**
 * 지금 스택을 히스토리 항목이 말하는 자리에 맞춘다.
 *
 * `stack`은 **아는 겹**만 담는다 — 겹 사이를 건너뛰거나 새로고침한 뒤에는
 * 아래 겹을 모를 수 있다. 화면에 보이는 것은 최상단 하나뿐이고 아래는 그것에
 * 완전히 가려지므로, 모르는 겹은 굳이 지어내지 않는다. 진짜 깊이는 `fromLevel`이
 * 들고 있다.
 */
export function reconcileToMark(
  stack: readonly DetailEntry[],
  fromLevel: number,
  mark: DetailMark | null,
): Reconcile {
  const target = mark?.level ?? 0;
  if (target === fromLevel) return { kind: "none" };

  // 흔한 길 — 뒤로가기 한 번. 유일하게 애니메이션을 태우는 경우다.
  if (target === fromLevel - 1 && stack.length > 0) return { kind: "closeTop" };

  if (mark === null) return { kind: "settle", stack: [] };
  if (target === fromLevel + 1) {
    return { kind: "settle", stack: [...stack, restored(mark.product)] };
  }
  if (target < fromLevel) {
    const keep = stack.length - (fromLevel - target);
    if (keep > 0) return { kind: "settle", stack: revealTop(stack.slice(0, keep)) };
  }
  // 아는 것이 없다 — 표식이 말하는 겹 하나만 되살린다
  return { kind: "settle", stack: [restored(mark.product)] };
}
