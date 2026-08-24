// 온보딩 옷 선택 화면에 그릴 카드 한 장. 순수 타입.

export interface OnboardingCandidate {
  goodsNo: number;
  /** 후보 목록에서의 순번. 화면 위치와 다를 수 있다 — 죽은 후보를 빼고 그리므로. */
  ord: number;
  title: string;
  brandName: string | null;
  thumbnail: string;
  width: number;
  height: number;
}
