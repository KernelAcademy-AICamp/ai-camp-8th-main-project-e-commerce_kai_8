"use client";

import { useGoogleSignIn } from "@/features/auth/presentation/view-model/use-google-sign-in";
import { CenterPopup, PopupButton, PopupMessage, PopupTitle } from "@/shared/ui/popup";

/**
 * 로그인 팝업 — 시안 `.login-pop`. 보던 화면 위에 그대로 뜬다.
 *
 * **구글 로그인은 이 창 안에서 끝나지 않는다.** 외부 사이트로 완전히 나갔다
 * 오는 이동이라 창이 아니라 화면이 통째로 바뀐다(구글 로그인 설계 §3). 그래서
 * 이 창이 맡는 것은 **떠나기 전까지**다 — 왜 로그인이 필요한지 알리고, 떠나기
 * 전에 돌아올 자리를 적어 둔다.
 *
 * **화살표는 직전 화면으로 되돌아간다.** 팝업만 닫는 것이 아니라 팝업이 뜬
 * 화면까지 닫는다 — 시안 `loginPopBack`("팝업이 뜬 화면을 닫고 메인으로").
 * 무엇이 직전 화면인지는 부르는 쪽이 정한다.
 *
 * **어두운 바탕은 부르는 쪽이 정한다.** 기본은 손잡이가 없다 — 바깥을 잘못 눌러
 * 보던 화면에서 튕겨 나가면 안 되기 때문이고, 시안도 여기에는 아무 동작을 달지
 * 않는다. 다만 바깥 누르기가 **그 자리에 머문 채 창만 접는 것**이라면 위험하지
 * 않으므로, 그때는 `onDismiss`를 준다.
 */
export function LoginPopup({
  onClose,
  onDismiss,
}: {
  /** 화살표 — 팝업이 뜬 화면까지 닫는다 */
  onClose: () => void;
  /** 어두운 바탕 누르기 — 주면 그 자리에서 창만 접는다 */
  onDismiss?: () => void;
}) {
  const { busy, failed, signIn } = useGoogleSignIn();

  return (
    <CenterPopup label="로그인 안내" onBack={onClose} onDismiss={onDismiss}>
      <PopupTitle>로그인이 필요해요</PopupTitle>
      <PopupMessage>
        취향 키워드와 저장한 핀은
        <br />
        로그인하면 볼 수 있어요.
      </PopupMessage>

      <PopupButton className="mt-4" onClick={signIn} disabled={busy}>
        로그인하기
      </PopupButton>

      {failed && (
        <p role="status" className="mt-2 text-xs text-danger">
          로그인을 시작하지 못했어요. 다시 시도해 주세요.
        </p>
      )}
    </CenterPopup>
  );
}
