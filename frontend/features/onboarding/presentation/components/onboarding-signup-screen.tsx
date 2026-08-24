"use client";

import Image from "next/image";
import Link from "next/link";

import { OnboardingHeader } from "./onboarding-header";

/**
 * 온보딩 3단계 — 계정 만들기. **새 기기 경로에만 있다**(로그인한 사람은 2화면).
 * 시안: `design/atee-taste-signup-sample.png`
 *
 * 이 화면은 "가입해 주세요"가 아니라 **"방금 고른 것이 어디로 가는지"**를 말한다.
 * 그래서 고른 사진 세 장이 하나로 모이는 그림이 본문이고, 버튼은 그 뒤에 온다.
 *
 * ⚠️ 시안에는 처리방침 링크가 없는데 **넣었다.** 구글 OAuth 심사가 동의 화면에서
 * 접근 가능한 처리방침을 요구한다(app/privacy/page.tsx 머리주석).
 */
export function OnboardingSignupScreen({
  stepIndex,
  stepCount,
  busy,
  failed,
  onSignIn,
  onBack,
}: {
  stepIndex: number;
  stepCount: number;
  busy: boolean;
  failed: boolean;
  onSignIn: () => void;
  onBack: () => void;
}) {
  return (
    <main className="mx-auto min-h-svh max-w-md px-6 pb-10 text-ink">
      <OnboardingHeader index={stepIndex} count={stepCount} onBack={onBack} />

      <div className="mt-6">
        <h1 className="text-[26px] leading-tight font-bold text-ink">
          취향 찾기를 계속할까요?
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          방금 고른 옷에서 시작해,
          <br />
          볼수록 더 나다운 티셔츠를 찾아드려요.
        </p>
      </div>

      <section className="mt-6 rounded-[28px] bg-raised px-5 pt-5 pb-2 neo-sm">
        {/* 시안에서 그림 영역을 그대로 잘라 쓴다(제품 책임자 결정 2026-08-24).
            DOM으로 다시 그린 판은 걷어냈다 — 부채꼴 겹침·연결선·등고선을 코드로
            근사하는 것보다 시안을 그대로 두는 편이 낫다고 판단했다.

            **여기 보이는 옷은 이 사람이 고른 것이 아니다** — 시안에 담긴 예시
            사진이고, **그대로 두기로 했다**(2026-08-24 제품 책임자). 위 문구
            ("방금 고른 옷에서 시작해")는 앞으로 무엇이 일어나는지를 말하는 것이지
            이 그림을 가리키는 것이 아니다. 시안도 같은 예시 사진을 썼다.

            ⚠️ **고치려 들지 말 것.** 이 어긋남은 몰라서 남은 것이 아니라 보고
            넘어가기로 한 것이다. 사용자가 고른 사진으로 바꾸려면 문구까지 함께
            보는 별도 결정이 필요하다. */}
        <Image
          src="/onboarding/taste-converge.jpg"
          alt=""
          width={710}
          height={672}
          priority
          className="w-full"
        />

        <ul className="mt-4">
          <li className="flex items-center gap-4 py-4">
            <FigureIcon>
              <path
                d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </FigureIcon>
            <span className="text-[15px] font-semibold text-ink">
              지금 고른 취향에서 추천 시작
            </span>
          </li>
          {/* 구분선은 **아래 항목의 테두리**로 준다 — 빈 `li`로 두면 보조기술이
              내용 없는 목록 항목을 하나 더 읽는다. */}
          <li className="flex items-center gap-4 border-t border-line py-4">
            <FigureIcon>
              <path
                d="M5 19V13m4.5 6V9M14 19v-4m4.5 4V6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <path
                d="M4 9.5 9.5 5l4 3.5L20 3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </FigureIcon>
            <span className="text-[15px] font-semibold text-ink">
              볼수록 더 나에게 맞게 변화
            </span>
          </li>
        </ul>
      </section>

      <div className="mt-7">
        <button
          type="button"
          onClick={onSignIn}
          disabled={busy}
          className="flex h-15 w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-thumb text-[17px] font-bold text-on-thumb neo active:neo-in disabled:opacity-60"
        >
          <GoogleMark />
          Google로 계속하기
        </button>
        {failed && (
          <p role="status" className="mt-3 text-center text-sm text-danger">
            로그인을 시작하지 못했어요. 다시 시도해 주세요.
          </p>
        )}
      </div>

      <div className="mt-5 space-y-1.5 text-center text-[13px] leading-relaxed text-ink-muted">
        <p>가입하면 취향과 찜이 계정에 저장돼요.</p>
        <p>
          받는 정보는 이메일 주소뿐이에요.{" "}
          {/* **같은 탭에 쌓는다**(제품 책임자 2026-08-24). 새 창으로 열었더니 그
              창에는 기록이 없어 닫기가 갈 곳이 없었다. 돌아왔을 때 3단계가 그대로
              남는 것은 온보딩이 제 위치를 기억하기 때문이다(use-onboarding-flow). */}
          <Link href="/privacy" className="underline">
            개인정보 처리방침
          </Link>
        </p>
      </div>
    </main>
  );
}

/**
 * 시안의 사각 아이콘 칸 — **테두리만** 있고 그림자가 없다.
 *
 * 안쪽 그림자를 주면 밝은 카드 위에서 파인 자국이 도드라져, 이미 그림자를 가진
 * 사진·원반과 겹쳐 카드 하나에 층이 너무 많아진다.
 */
function FigureIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border border-line text-ink-soft"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        {children}
      </svg>
    </span>
  );
}

/**
 * ⚠️ **구글 G는 상표다.** 아래 SVG는 널리 쓰이는 형태를 옮긴 것이지 구글이
 * 배포하는 **공식 에셋이 아니다.** 문구도 구글이 승인한 표현인지 대조하지 않았다.
 * **프로덕션 OAuth 심사 전에 공식 에셋·문구와 대조해야 한다.**
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
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
