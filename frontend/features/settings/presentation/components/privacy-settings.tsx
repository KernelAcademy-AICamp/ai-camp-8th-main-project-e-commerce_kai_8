"use client";

import { usePrivacySettings } from "@/features/settings/presentation/view-model/use-privacy-settings";

/**
 * 개인화 고지 문구 + 데이터 초기화 (PRD P0 고지·동의, 설계 §4 프라이버시).
 * 문구는 제품 책임자 승인 대상 — docs/plans/2026-08-16 계획 1단계.
 */
export function PrivacySettings() {
  const { status, requestClear, cancelClear, confirmClear } = usePrivacySettings();

  return (
    <div>
      <h2 className="mb-3 text-base font-semibold text-white">개인화 안내</h2>

      <section className="space-y-4 text-[15px] leading-relaxed">
        <p>
          aTee는 회원가입 없이 취향에 맞는 피드를 만들기 위해, 이 브라우저에 무작위로
          만든 <b className="text-white">익명 ID</b>를 저장합니다.
        </p>
        <p>
          탐색 중의 행동 — 카드가 화면에 보임, 상세 열기, 찜, 판매처 이동 — 이 익명 ID와
          함께 기록됩니다. 기록은 피드 개인화와 추천 품질 평가에만 사용합니다.
        </p>
        <p>
          <b className="text-white">검색어</b>는 검색 품질을 개선하고 평가하기 위해
          입력한 내용 그대로 기록되며,{" "}
          <b className="text-white">90일 뒤 자동으로 삭제</b>됩니다. 검색 기록은 추천
          프로필 계산에는 쓰이지 않습니다.
        </p>
        <p>
          이름·연락처·계정 같은 개인정보를 묻거나 따로 저장하지는 않습니다. 다만
          검색창은 무엇이든 입력할 수 있으므로, 개인적인 내용은 적지 않는 편이 좋습니다.
          취향 프로필(좋아하는 스타일 요약)은 서버가 아니라 이 기기에만 저장됩니다.
        </p>
        <p>
          아래 버튼을 누르면 이 기기의 익명 ID·취향 프로필과 서버에 기록된 행동
          기록·검색 기록이 모두 삭제되고 처음 상태로 돌아갑니다.
        </p>
      </section>

      <section className="mt-8">
        {status.kind === "idle" && (
          <button
            type="button"
            onClick={requestClear}
            className="w-full cursor-pointer rounded-xl bg-neutral-800 py-3 font-medium text-white"
          >
            개인화 데이터 모두 지우기
          </button>
        )}
        {status.kind === "confirming" && (
          <div className="space-y-3">
            <p className="text-center text-sm text-neutral-400">
              정말 지울까요? 지금까지의 탐색 기록과 취향이 사라집니다.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelClear}
                className="flex-1 cursor-pointer rounded-xl bg-neutral-800 py-3 font-medium text-white"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmClear}
                className="flex-1 cursor-pointer rounded-xl bg-red-900/80 py-3 font-medium text-white"
              >
                지우기
              </button>
            </div>
          </div>
        )}
        {status.kind === "working" && (
          <p className="text-center text-sm text-neutral-400">지우는 중…</p>
        )}
        {status.kind === "done" && (
          <p className="text-center text-sm text-neutral-300">
            삭제했습니다
            {status.deletedOnServer !== null
              ? ` (서버 기록 ${String(status.deletedOnServer)}건 포함)`
              : " (서버 기록 삭제는 다음 접속에서 다시 시도됩니다)"}
            . 새로운 익명 ID로 처음부터 시작합니다.
          </p>
        )}
        {status.kind === "failed" && (
          <p className="text-center text-sm text-red-400">
            삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
      </section>
    </div>
  );
}
