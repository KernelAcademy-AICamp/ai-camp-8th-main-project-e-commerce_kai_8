"use client";

import { useGoogleSignIn } from "@/features/auth/presentation/view-model/use-google-sign-in";
import { BackIcon } from "@/shared/icons";

/**
 * 로그인 팝업 — 시안 `.login-pop`. 보던 화면 위에 그대로 뜬다.
 *
 * **구글 로그인은 이 창 안에서 끝나지 않는다.** 외부 사이트로 완전히 나갔다
 * 오는 이동이라 창이 아니라 화면이 통째로 바뀐다(구글 로그인 설계 §3). 그래서
 * 이 창이 맡는 것은 **떠나기 전까지**다 — 왜 로그인이 필요한지 알리고, 떠나기
 * 전에 돌아올 자리를 적어 둔다.
 *
 * **화면 한가운데에 둔다.** 시안은 폰 틀 안 40% 높이였지만, 실제 화면에서는
 * 위로 치우쳐 보였다(2026-08-22 제품 책임자). 자리는 `inset-0` 위의 가운데
 * 정렬로 잡는다 — 좌표를 절반씩 옮기는 방식은 **변형이 걸린 조상**이 하나만
 * 있어도 그 조상 기준으로 어긋난다.
 */
export function LoginPopup({ onClose }: { onClose: () => void }) {
  const { busy, failed, signIn } = useGoogleSignIn();

  return (
    <div className="fixed inset-0 z-[48] flex items-center justify-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-[rgb(23_21_15/0.25)]"
      />
      <div
        role="dialog"
        aria-label="로그인 안내"
        className="relative w-[250px] rounded-[20px] bg-app px-[22px] pt-[26px] pb-5 text-center shadow-[0_4px_16px_rgb(30_38_55/0.24)]"
      >
        <button
          type="button"
          aria-label="뒤로가기"
          onClick={onClose}
          className="absolute top-[11px] left-[11px] flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full bg-app text-ink-soft shadow-[0_1px_3px_rgb(30_38_55/0.25)] active:scale-[0.92]"
        >
          <BackIcon size={15} />
        </button>

        <p className="text-[15.5px] font-extrabold text-ink">로그인이 필요해요</p>
        <p className="mt-2 text-xs leading-relaxed font-[650] text-ink-soft">
          취향 키워드와 저장한 핀은
          <br />
          로그인하면 볼 수 있어요.
        </p>

        <button
          type="button"
          onClick={signIn}
          disabled={busy}
          className="mt-4 h-[42px] w-full cursor-pointer rounded-full bg-slate text-sm font-extrabold text-on-slate shadow-[0_1px_4px_rgb(30_38_55/0.28)] disabled:opacity-60"
        >
          로그인하기
        </button>

        {failed && (
          <p role="status" className="mt-2 text-xs text-danger">
            로그인을 시작하지 못했어요. 다시 시도해 주세요.
          </p>
        )}
      </div>
    </div>
  );
}
