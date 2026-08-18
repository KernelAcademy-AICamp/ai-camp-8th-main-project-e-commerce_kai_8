import type { Metadata } from "next";
import Link from "next/link";

/**
 * 공개 개인정보 처리방침.
 *
 * 구글은 프로덕션 OAuth 앱에 대해 홈페이지와 동의 화면에서 **접근 가능한**
 * 처리방침을 요구한다. 그래서 로그인 없이 열리는 정적 페이지로 둔다.
 *
 * 내용의 정본은 docs/atee/living/data-collection-policy.md다. 그쪽을 고치면
 * 여기도 함께 고친다.
 */
export const metadata: Metadata = {
  title: "개인정보 처리방침 · aTee",
  description: "aTee가 무엇을 수집하고, 얼마나 보관하고, 어떻게 지우는지.",
};

const UPDATED_AT = "2026년 8월 18일";

/** 구글 OAuth 심사가 처리방침에 연락 수단을 요구한다 (2026-08-18 제품 책임자 결정). */
const CONTACT_EMAIL = "likefry98@gmail.com";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-6 text-neutral-200">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/settings"
          aria-label="설정으로 돌아가기"
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-white"
        >
          ←
        </Link>
        <h1 className="text-lg font-semibold text-white">개인정보 처리방침</h1>
      </header>

      <p className="mb-8 text-sm text-neutral-400">최종 갱신 {UPDATED_AT}</p>

      <section className="space-y-4 text-[15px] leading-relaxed">
        <h2 className="text-base font-semibold text-white">한 줄 요약</h2>
        <p>
          aTee는 취향에 맞는 티셔츠 피드를 만들기 위해 이 브라우저의{" "}
          <b className="text-white">익명 ID</b>와 탐색 행동을 기록합니다. 로그인은
          선택이며, 하면 이메일 주소를 계정으로 저장합니다. 둘 다 언제든 지울 수
          있습니다.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-[15px] leading-relaxed">
        <h2 className="text-base font-semibold text-white">무엇을 수집하나요</h2>

        <h3 className="font-medium text-white">로그인하지 않아도</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b className="text-white">익명 ID</b> — 이 브라우저에 무작위로 만들어
            저장하는 식별자입니다. 이름·연락처와 연결되지 않습니다.
          </li>
          <li>
            <b className="text-white">탐색 행동</b> — 카드가 화면에 보임, 상세 열기, 찜,
            판매처 이동. 익명 ID와 함께 기록되며 피드 개인화와 추천 품질 평가에만
            씁니다.
          </li>
          <li>
            <b className="text-white">검색어</b> — 입력한 내용 그대로 기록되며{" "}
            <b className="text-white">90일 뒤 자동으로 삭제</b>됩니다. 검색 품질을
            개선하고 평가하기 위한 것이며, 추천 프로필 계산에는 쓰지 않습니다.
          </li>
          <li>
            <b className="text-white">취향 프로필</b> — 좋아하는 스타일 요약입니다.
            서버로 보내지 않고 이 기기에만 둡니다.
          </li>
        </ul>

        <h3 className="font-medium text-white">로그인하면 (선택)</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            구글 로그인의 <b className="text-white">기본 범위</b>만 받습니다 — 이메일
            주소와 구글이 발급한 고유 식별자. 프로필 사진·연락처·성별·생년월일 같은 추가
            범위는 요청하지 않습니다.
          </li>
          <li>
            저장되는 것: 계정 식별자와 이메일, 가입·마지막 로그인 시각, 연결된 구글
            신원, 로그인 세션과 갱신 토큰.
          </li>
          <li>이 기기에는 로그인 세션 쿠키와 현재 신원 표시자가 남습니다.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 text-[15px] leading-relaxed">
        <h2 className="text-base font-semibold text-white">계정과 익명 ID의 관계</h2>
        <p>
          서버에는 계정과 익명 ID를 잇는 기록을 만들지 않습니다. 탐색 행동은 익명 ID로만
          기록되며 계정 식별자를 함께 담지 않습니다.
        </p>
        <p>
          다만 <b className="text-white">연결이 전혀 없다는 뜻은 아닙니다.</b> 이
          기기에는 익명 ID와 신원 표시자가 함께 남고, 로그인한 상태로 보내는 요청에는
          세션 쿠키와 익명 ID가 함께 실립니다.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-[15px] leading-relaxed">
        <h2 className="text-base font-semibold text-white">얼마나 보관하나요</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>검색어 기록 — 90일 뒤 자동 삭제</li>
          <li>탐색 행동·익명 ID — 지울 때까지</li>
          <li>계정 — 탈퇴할 때까지</li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 text-[15px] leading-relaxed">
        <h2 className="text-base font-semibold text-white">어떻게 지우나요</h2>
        <p>
          <b className="text-white">개인화 데이터 모두 지우기</b> — 이 기기의 익명
          ID·취향 프로필과 서버에 기록된 탐색 행동·검색어가 지워지고 새 익명 ID로 처음
          상태가 됩니다. 계정은 남습니다.
        </p>
        <p>
          <b className="text-white">계정 삭제</b> — 계정과 연결된 구글 신원, 로그인
          세션이 지워지고, 이어서 이 기기의 탐색 행동·검색어 기록도 함께 지워집니다.
        </p>
        <p>
          서버 삭제가 실패하면 이 기기가 그 사실을 적어 두고 다음 접속에서 다시
          시도합니다. 이 목록은 잘라내지 않습니다.
        </p>
        <p className="text-sm text-neutral-400">
          <b className="text-neutral-300">지워지지 않는 것:</b> 인증 서비스 제공자가
          운영 목적으로 남기는 접속 기록입니다. 우리는 그 기록을 보관하지 않으며,
          조회하거나 삭제할 수도 없습니다. 보존 기간은 확인하지 못했고, 확인되면 이
          문서를 갱신합니다.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-[15px] leading-relaxed">
        <h2 className="text-base font-semibold text-white">알아두실 것</h2>
        <p>
          검색창에는 무엇이든 입력할 수 있고 입력한 내용이 그대로 기록되므로, 개인적인
          내용은 적지 않는 편이 좋습니다.
        </p>
        <p>
          aTee는 현재 <b className="text-white">검증 단계</b>의 서비스입니다. 수집
          범위가 바뀌면 이 문서를 갱신하고 앱에서 다시 안내합니다.
        </p>
      </section>

      <section className="mt-8 mb-4 space-y-4 text-[15px] leading-relaxed">
        <h2 className="text-base font-semibold text-white">문의</h2>
        <p className="text-neutral-400">
          개인정보 열람·삭제 요청을 포함한 문의는 아래로 보내주세요.
        </p>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-white underline">
            {CONTACT_EMAIL}
          </a>
        </p>
        <p className="text-sm text-neutral-400">
          앱 안에서 직접 지우는 것이 가장 빠릅니다 — 설정 화면의 개인화 데이터 지우기와
          계정 삭제가 같은 일을 즉시 처리합니다.
        </p>
      </section>

      <Link
        href="/settings"
        className="mt-4 block rounded-xl bg-neutral-800 py-3 text-center font-medium text-white"
      >
        설정으로 돌아가기
      </Link>
    </main>
  );
}
