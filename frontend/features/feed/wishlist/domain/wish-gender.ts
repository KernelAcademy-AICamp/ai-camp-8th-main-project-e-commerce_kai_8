// 보관함에서 "지금 고른 성별에 보이는 찜"을 가려내는 순수 규칙.
// 설계: docs/superpowers/specs/2026-08-22-보관함-성별-필터-design.md
//
// **원본은 자르지 않는다.** 이 함수가 내는 것은 화면용 파생값이고, 원본 목록은
// 상세 하트 판정·담기/빼기·로그인 승계가 계속 쓴다. 그래서 이 규칙은 저장소가
// 아니라 그 위(뷰모델)에서만 적용한다.
//
// 이미 있는 것을 찾아본 기록(AGENTS.md): 큐레이션에 성별 필터가 있다
// (features/curation/domain/curation-gender.ts). **재사용하지 않는다** —
// ⓐ 거르는 대상이 다르고(큐레이션 슬라이드 vs 찜) ⓑ 미상 정책이 정반대이며
// (큐레이션은 미상을 남긴다) ⓒ 곧 걷어낼 shared/profile의 타입에 의존한다.

import type { GenderSetting } from "@/shared/gender/gender-setting";

import type { WishlistEntry } from "./wishlist";

export interface VisibleWishes {
  /** 지금 성별에서 보이는 찜 — 원본 순서(최신부터)를 지킨다 */
  entries: readonly WishlistEntry[];
  /** 같은 목록에서 가려진 수. 화면이 "숨겼다"고 알릴 때 쓴다. */
  hiddenCount: number;
}

/**
 * 고른 성별 라벨과 **정확히 같은** 상품만 남긴다 — 공용도 미상도 뺀다(O-39).
 *
 * **성별이 미확정이면 아무것도 숨기지 않는다.** 숨길 기준값이 없기 때문이다.
 * 보관함은 새로 불러오는 탐색 목록이 아니라 이미 계정에 있는 데이터라, 기준을
 * 모를 때 감추는 쪽이 더 나쁘다.
 *
 * 숨길 것이 없으면 **받은 배열을 그대로 돌려준다** — 새 배열을 만들면 이 값을
 * 기억해 두는 화면이 매번 다시 그려진다.
 */
export function selectVisibleWishes(
  entries: readonly WishlistEntry[],
  gender: GenderSetting,
): VisibleWishes {
  if (gender === null) return { entries, hiddenCount: 0 };

  const visible = entries.filter((entry) => entry.product.gender === gender);
  if (visible.length === entries.length) return { entries, hiddenCount: 0 };
  return { entries: visible, hiddenCount: entries.length - visible.length };
}
