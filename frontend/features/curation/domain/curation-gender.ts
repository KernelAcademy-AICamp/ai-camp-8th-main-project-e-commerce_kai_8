// 큐레이션에서 내 성별 상품만 남긴다.
// 계획: docs/plans/2026-08-21-curation-gender-filter.md

import type { Curation } from "@/features/curation/domain/curation";
import type { DominantGender } from "@/shared/profile/profile-rules";

/**
 * 거른 뒤 이보다 적게 남은 큐레이션은 목록에서 뺀다.
 *
 * 실린 9장은 성별을 안 보고 평점순으로 뽑은 것이라 한쪽 성별로 쏠려 있다. 거르면
 * 남성 기준 10개가 0장, 14개가 1~2장이 된다(2026-08-21 실측). 1~2장짜리를 첫 화면에
 * 세우면 눌렀을 때 게시물이라기엔 너무 짧다.
 */
export const MIN_SLIDES = 3;

/**
 * **공용도 뺀다.** 인터뷰에서 공용 상품 썸네일에 여성 모델이 보이면 거부감을 느낀다는
 * 응답이 대부분이었다(제품 책임자 결정 2026-08-21). 실측으로도 공용은 남성복에 가깝다
 * — 어깨 중앙 52cm로 남성과 같고 92%가 46cm 이상이라, 여성에게 공용을 통과시키는
 * 현행 피드 규칙("성별+공용")은 대칭이 아니다. BROWSE는 아직 그 규칙 그대로다.
 *
 * 성별 미판정(비회원·콜드스타트)이면 아무것도 거르지 않는다 — 개인화인 척하지 않는다.
 * 상품 성별이 미상인 것도 남긴다. 못 입는다는 근거가 없는데 화면만 줄어든다.
 */
export function filterByGender(
  curations: Curation[],
  gender: DominantGender | undefined,
): Curation[] {
  if (!gender) return curations;
  return curations
    .map((curation) => ({
      ...curation,
      items: curation.items.filter((item) => item.g === undefined || item.g === gender),
    }))
    .filter((curation) => curation.items.length >= MIN_SLIDES);
}
