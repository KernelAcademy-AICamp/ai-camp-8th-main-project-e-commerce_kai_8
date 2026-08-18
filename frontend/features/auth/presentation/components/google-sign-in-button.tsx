"use client";

/**
 * 구글 로그인 버튼.
 *
 * ⚠️ **구글 G는 상표다.** 아래 SVG는 널리 쓰이는 형태를 옮긴 것이지 구글이
 * 배포하는 **공식 에셋이 아니다.** 문구("Google 계정으로 로그인")도 구글이
 * 승인한 표현인지 대조하지 않았다.
 *
 * **프로덕션 OAuth 심사 전에 공식 에셋·문구와 대조해야 한다.** 대조하기 전에는
 * "구글 브랜딩 규칙을 지켰다"고 말하지 않는다.
 *
 * 흰 바탕을 고른 이유: 이 앱은 배경이 거의 검정이라, 흰 버튼이 화면에서 유일하게
 * 밝은 요소가 되어 자연히 시선이 간다.
 */
export function GoogleSignInButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-white px-5 font-medium text-[#1f1f1f] disabled:opacity-60"
    >
      <GoogleMark />
      <span className="text-[15px]">Google 계정으로 로그인</span>
    </button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
