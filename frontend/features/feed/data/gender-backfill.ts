// 기존 장기 앵커 성별 1회 보강 (설계: 성별 피드 하드 필터 3단계).
//
// 2단계 전에 쌓인 장기 앵커는 성별 필드가 없다. c_feed_products 뷰에서
// goods_no로 성별을 채워 넣어야 우세 성별 판정(profile-rules.deriveDominantGender)이
// 그 앵커들도 모수로 쓸 수 있다.

import { type AnchorGender, toAnchorGender } from "@/shared/profile/profile-rules";
import {
  applyAnchorGenders,
  longAnchorsMissingGender,
} from "@/shared/profile/profile-store";
import { restSelect } from "@/shared/supabase-rpc";

interface AnchorGenderRow {
  goods_no: number;
  gender: string | null;
}

/**
 * goods_no 목록으로 c_feed_products 뷰에서 성별을 조회한다 (in-list 문법).
 * 뷰에 없는 상품·빈 문자열 성별은 결과 맵에 없다 — 호출부가 미상으로 남긴다.
 */
export async function fetchAnchorGenders(
  goodsNos: number[],
): Promise<Map<number, AnchorGender>> {
  if (goodsNos.length === 0) return new Map();
  const rows = await restSelect<AnchorGenderRow[]>(
    `c_feed_products?select=goods_no,gender&goods_no=in.(${goodsNos.join(",")})`,
  );
  const result = new Map<number, AnchorGender>();
  for (const row of rows) {
    const gender = toAnchorGender(row.gender);
    if (gender !== undefined) result.set(row.goods_no, gender);
  }
  return result;
}

/**
 * 성별 없는 장기 앵커를 1회 보강한다 — 회원 + 보강 대상이 있을 때 호출부(피드
 * 뷰모델 마운트)가 부른다.
 *
 * 실패해도 조용히 무시한다 — 다음 세션에 같은 대상이 다시 조회될 뿐이고,
 * 이 요청이 피드 로드를 막으면 안 된다(50개 in-list 1회라 재시도가 저렴하다).
 */
export async function backfillAnchorGenders(): Promise<void> {
  const goodsNos = longAnchorsMissingGender();
  if (goodsNos.length === 0) return;
  try {
    const genders = await fetchAnchorGenders(goodsNos);
    applyAnchorGenders(genders);
  } catch {
    // 다음 세션에 다시 시도된다
  }
}
