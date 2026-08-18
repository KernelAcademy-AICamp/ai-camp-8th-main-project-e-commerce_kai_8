// 무신사 착용감 통제 어휘 — search_goods.wear_chars 축별 distinct 값(서열순, 2026-07-30).
// provenance: `SELECT DISTINCT` on search_goods.wear_chars (스크래치패드 profile_llm_signals.py).
//   스냅샷 테스트는 이 상수의 우발적 편집만 막는다(테스트가 DB를 조회하지 않으므로
//   DB 드리프트는 감지 못 함). DB 값이 바뀔 수 있으니 주기적으로 재추출해 갱신할 것.
// 핏 축은 style.fits와 중복이라 제외(Global Constraints). 값은 DB와 정확 일치(파이프 포맷 보존).
import type { WearAxis } from "@/features/search/domain/query-intent";

export const WEAR_CHARS_VOCAB: Record<WearAxis, readonly string[]> = {
  촉감: ["부드러움", "약간|부드러움", "보통", "약간|뻣뻣함"],
  두께: ["얇음", "약간 얇음", "보통", "약간|두꺼움", "두꺼움"],
  비침: ["없음", "거의 없음", "보통", "약간 있음", "있음"],
  신축성: ["있음", "약간 있음", "보통", "거의 없음", "없음"],
  계절: ["봄", "여름"],
};
