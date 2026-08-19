// 이 히스토리 항목이 앱의 첫 자리인가 — 순수 규칙.
//
// "화면 안 뒤로가기가 진짜 뒤로 가도 되는가"를 답하려고 있다. 예전에는 그걸
// **참조 주소**로 판단했다. 그런데 이 앱의 화면 이동은 주소만 바꾸는 방식이라
// 참조 주소가 **갱신되지 않고**, 홈 화면에서 띄운 PWA는 처음부터 비어 있다.
// 그래서 사실상 항상 "밖에서 왔다"로 판정돼 뒤로 가는 대신 홈을 현재 자리에
// 덮어썼고, 덮어쓰기는 앞의 홈을 지우지 않으므로 **홈이 두 칸씩 쌓였다.**
//
// ⚠️ 자리마다 **순번**을 매기는 방식도 생각했지만 쓰지 않는다. 상세 오버레이가
// 만드는 항목은 주소가 바뀌지 않아 번호를 받지 못하는데, 나중에 그 자리로 뒤로
// 가면 더 큰 번호가 새로 매겨져 깊이가 거꾸로 늘어난다. 첫 자리인지만 표시하면
// 그런 일이 없다.

import { readEntryValue, withEntryValue } from "@/shared/history/history-state";

const MARK_KEY = "aTeeNav";

/** `root` = 앱이 시작된 자리, `inner` = 앱 안에서 옮겨 다니다 생긴 자리 */
export type NavMark = "root" | "inner";

/** 이 항목의 표시. 아직 없거나 알 수 없는 값이면 null. */
export function readNavMark(state: unknown): NavMark | null {
  const raw = readEntryValue(state, MARK_KEY);
  return raw === "root" || raw === "inner" ? raw : null;
}

/** 기존 값을 지우지 않고 표시만 얹는다. */
export function withNavMark(state: unknown, mark: NavMark): Record<string, unknown> {
  return withEntryValue(state, MARK_KEY, mark);
}

/**
 * 이 자리에 적어야 할 표시. 적을 것이 없으면 null.
 *
 * @param current 이 항목에 이미 적힌 표시
 * @param seenAny 이 세션에서 표시된 자리를 이미 본 적이 있는가
 */
export function nextNavMark(current: NavMark | null, seenAny: boolean): NavMark | null {
  // 표시는 새로고침해도 살아남는다. 덮어쓰면 안쪽 자리가 첫 자리로 둔갑해
  // 뒤로가기가 다시 덮어쓰기로 떨어진다 — 그게 원래 결함이었다.
  if (current !== null) return null;
  return seenAny ? "inner" : "root";
}

/**
 * 뒤로 가면 앱 안에 머무는가.
 *
 * 표시를 모르면 **가지 않는다.** 모르는 채로 뒤로 가면 앱 밖으로 튕겨 나갈 수 있다.
 */
export function canGoBackInApp(mark: NavMark | null): boolean {
  return mark === "inner";
}
