// 찜이 뜻대로 되지 않았을 때 보여줄 문구 — 상세 화면과 보관함이 함께 쓴다.
//
// **이유를 구분한다.** 같은 문구를 쓰면 사용자가 "다시 누르면 되는 일"인지
// "더 담을 수 없는 일"인지 알 수 없다.

/** 화면에 보여줄 사정 */
export type WishlistNotice = "full" | "failed" | "login" | null;

export function wishlistNoticeMessage(notice: WishlistNotice): string | null {
  switch (notice) {
    case "login":
      // "이 기기 찜이 올라온다"를 반드시 함께 말한다. 없으면 사용자는 지금
      // 기기에 담긴 찜이 사라졌다고 본다.
      return "찜은 로그인해야 담을 수 있어요. 이 기기에 찜해둔 것은 로그인하면 계정으로 올라옵니다.";
    case "full":
      return "찜은 500개까지 담을 수 있어요. 오래된 것을 지우고 다시 시도해 주세요.";
    case "failed":
      return "찜을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
    case null:
      return null;
  }
}
