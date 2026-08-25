"use client";

import Link from "next/link";

import { usePrivacySettings } from "@/features/settings/presentation/view-model/use-privacy-settings";

/**
 * 개인화 고지 문구 + 데이터 초기화 (PRD P0 고지·동의, 설계 §4 프라이버시).
 * 문구는 제품 책임자 승인 대상 — docs/plans/2026-08-16 계획 1단계.
 */
export function PrivacySettings() {
  const { status, requestClear, cancelClear, confirmClear, finishClear } =
    usePrivacySettings();

  return (
    // 위 성별 선택(GenderSettings)과의 간격 — 그쪽 첫 여백(mt-8)과 같은 값으로
    // 맞춘다. 전엔 여백이 아예 없어 두 구역이 거의 붙어 보였다(2026-08-25).
    <div className="mt-8">
      {/* 평소엔 접어둔다 — 긴 고지가 화면을 덮지 않게 (제목을 누르면 펼침) */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-ink [&::-webkit-details-marker]:hidden">
          개인화 안내
          <span
            aria-hidden
            className="text-ink-muted transition-transform group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>

        <section className="mt-3 space-y-4 text-[15px] leading-relaxed">
          <p>
            <b className="text-ink">로그인하지 않으면 탐색 행동을 기록하지 않습니다.</b>{" "}
            카드가 화면에 보임, 상세 열기, 찜, 판매처 이동 — 아무것도 남기지 않고,
            피드도 개인화하지 않습니다.
          </p>
          <p>
            로그인하면 그 행동이 기록되어 <b className="text-ink">취향 피드</b>와 추천
            품질 평가에 쓰입니다. 기록은 계정이 아니라 이 브라우저의{" "}
            <b className="text-ink">익명 ID</b>에 붙습니다.
          </p>
          <p>
            <b className="text-ink">검색어</b>는 검색 품질을 개선하고 평가하기 위해
            입력한 내용 그대로 기록되며,{" "}
            <b className="text-ink">90일 뒤 자동으로 삭제</b>됩니다. 검색 기록은 추천
            프로필 계산에는 쓰이지 않습니다.
          </p>
          <p>
            <b className="text-ink">로그인은 선택</b>입니다. 로그인하면 구글 로그인의
            기본 범위인 <b className="text-ink">이메일 주소와 구글이 발급한 식별자</b>만
            받아 계정으로 저장하고, <b className="text-ink">찜한 상품 번호</b>를 계정에
            담아 다른 기기에서도 보이게 합니다. 구글에서{" "}
            <b className="text-ink">프로필 사진·연락처·성별·생년월일</b>을 받아오지는
            않습니다. 서버에는 계정과 익명 ID를 잇는 기록을 만들지 않습니다 — 다만 이
            기기에는 둘이 함께 남으므로, 기기를 들여다보면 이을 수 있습니다.
          </p>
          <p>
            <b className="text-ink">보여줄 상품의 성별</b>은 위에서 직접 고른 값입니다.
            구글에서 받아온 것이 아니라 이 앱에만 있는 설정이고, 로그인하면 다른
            기기에서도 같게 보이도록 계정에 함께 저장합니다.{" "}
            <b className="text-ink">아래 초기화로 함께 지워집니다</b> — 처음 온 사람과
            같은 상태로 돌아가므로, 다음에 앱을 열면 다시 묻습니다. 로그아웃해도 이
            기기에서 지워지고, 계정을 삭제하면 계정에 있던 값도 함께 사라집니다.
          </p>
          <p>
            이름·연락처를 따로 묻지는 않습니다. 다만 검색창은 무엇이든 입력할 수
            있으므로, 개인적인 내용은 적지 않는 편이 좋습니다. 취향 프로필(좋아하는
            스타일 요약)은 로그인하면 계정에, 로그인하지 않으면 이 기기에만 저장됩니다.
          </p>
          <p>
            아래 버튼을 누르면 <b className="text-ink">처음 온 사람과 같은 상태</b>로
            돌아갑니다 — 익명 ID·취향 프로필·최근 본 제품·보여줄 상품의 성별이 지워지고,
            서버에 기록된 행동 기록·검색 기록과{" "}
            <b className="text-ink">계정에 담긴 찜·폴더</b>도 삭제됩니다. 찜과 폴더는
            계정에 있으므로 <b className="text-ink">다른 기기에서도 함께 사라집니다.</b>{" "}
            계정 자체는 남습니다 — 계정까지 지우려면 계정 삭제를 쓰세요.
          </p>
          <p className="text-sm text-ink-soft">
            더 자세한 내용은{" "}
            <Link href="/privacy" className="text-ink-soft underline">
              개인정보 처리방침
            </Link>
            에 있습니다.
          </p>
        </section>
      </details>

      <section className="mt-8">
        {status.kind === "idle" && (
          <button
            type="button"
            onClick={requestClear}
            className="w-full cursor-pointer rounded-xl bg-well neo py-3 font-medium text-ink"
          >
            개인화 데이터 모두 지우기
          </button>
        )}
        {status.kind === "confirming" && (
          <div className="space-y-3">
            <p className="text-center text-sm text-ink-soft">
              정말 지울까요? 지금까지의 탐색 기록과 취향이 사라집니다.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelClear}
                className="flex-1 cursor-pointer rounded-xl bg-well neo py-3 font-medium text-ink"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmClear}
                className="flex-1 cursor-pointer rounded-xl bg-danger py-3 font-medium text-ink"
              >
                지우기
              </button>
            </div>
          </div>
        )}
        {status.kind === "working" && (
          <p className="text-center text-sm text-ink-soft">지우는 중…</p>
        )}
        {status.kind === "done" && (
          <div className="space-y-3">
            <p className="text-center text-sm text-ink-soft">
              삭제했습니다
              {status.deletedOnServer !== null
                ? ` (서버 기록 ${String(status.deletedOnServer)}건 포함)`
                : " (서버 기록 삭제는 다음 접속에서 다시 시도됩니다)"}
              . 새로운 익명 ID로 처음부터 시작합니다.
            </p>
            {/* 저장소만 비우면 이미 올라온 화면이 그대로 남는다 — 처음 화면부터
                다시 부른다 (팝오버 쪽 "확인"과 같은 끝맺음) */}
            <button
              type="button"
              onClick={finishClear}
              className="w-full cursor-pointer rounded-xl bg-well neo py-3 font-medium text-ink"
            >
              처음 화면으로
            </button>
          </div>
        )}
        {status.kind === "failed" && (
          <p className="text-center text-sm text-danger">
            삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
      </section>
    </div>
  );
}
