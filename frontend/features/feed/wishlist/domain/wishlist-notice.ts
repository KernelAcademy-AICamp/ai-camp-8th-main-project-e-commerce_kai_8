// 찜이 뜻대로 되지 않았을 때 보여줄 문구 — 상세 화면과 보관함이 함께 쓴다.
//
// **이유를 구분한다.** 같은 문구를 쓰면 사용자가 "다시 누르면 되는 일"인지
// "더 담을 수 없는 일"인지 알 수 없다.

/**
 * 화면에 보여줄 사정.
 *
 * 로그인이 필요한 경우는 여기 없다 — 그때는 문구를 띄우지 않고 **로그인 화면으로
 * 바로 보낸다.** 하트는 동작이므로 설명을 한 단계 끼우지 않는다.
 */
export type WishlistNotice = "full" | "failed" | null;

export function wishlistNoticeMessage(notice: WishlistNotice): string | null {
  switch (notice) {
    case "full":
      return "찜은 500개까지 담을 수 있어요. 오래된 것을 지우고 다시 시도해 주세요.";
    case "failed":
      return "찜을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
    case null:
      return null;
  }
}
