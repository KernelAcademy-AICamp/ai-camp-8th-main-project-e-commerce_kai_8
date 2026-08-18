// 검색 의도 색 → 상품의 색별 이미지 인덱스에서 표시 이미지 1장 선택(순수·결정적).
// 계약: 검색 결과 순서·랭킹엔 영향 없음. 확신 없으면 null(→ 호출측이 기존 thumbnail 유지).
// color_images 원천 = m_raw_goods.color_images.byColor (오프라인 배치 산출, status 검증됨).

export interface ColorImageEntry {
  url: string;
  src: string;
  status: string; // "auto_high" | "verified" | …(배치 산출)
  // dE/margin/consensus는 초기 색추출 배치의 흔적(선택적). 현행 라벨 기반 산출엔 없을 수 있음.
  dE?: number;
  margin?: number;
  consensus?: boolean;
}
export type ColorImages = Record<string, ColorImageEntry>;

export interface DisplayImage {
  url: string;
  color: string;
}

// 교체 허용 = 신뢰 상태만. abstain/저신뢰는 배치에서 애초에 byColor에 넣지 않지만, 방어적으로 재확인.
const TRUSTED = new Set(["auto_high", "verified"]);

/**
 * byColor는 배치에서 **썸네일 실제색(thumbColor)을 제외한** 색만 담는다.
 * 따라서 byColor에 있는 색 = "썸네일과 다른, 그 색 사진이 있는 색" → 그대로 교체 대상.
 * (상품 `color`(대표색) 필드는 성별·핏 등 노이즈가 많아 신뢰하지 않는다.)
 * @param byColor      상품의 색별 이미지(썸네일색 제외)
 * @param intentColors 검색 의도 포함 색(우선순위 = 배열 순서)
 * @param excludeColors 검색 의도 제외 색
 */
export function pickColorImage(
  byColor: ColorImages | null | undefined,
  intentColors: readonly string[],
  excludeColors: readonly string[],
): DisplayImage | null {
  if (!byColor) return null;
  const exclude = new Set(excludeColors);
  for (const color of intentColors) {
    if (exclude.has(color)) continue;
    if (!Object.hasOwn(byColor, color)) continue; // 색이 인덱스에 없음(=썸네일색이거나 사진없음)
    const entry = byColor[color];
    if (TRUSTED.has(entry.status)) {
      return { url: entry.url, color };
    }
  }
  return null;
}
