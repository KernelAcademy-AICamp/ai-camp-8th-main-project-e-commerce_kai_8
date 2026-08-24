"use client";

import Image from "next/image";

import type { OnboardingCandidate } from "@/features/onboarding/domain/candidate";

import { OnboardingHeader } from "./onboarding-header";

/**
 * 온보딩 2단계 — 마음에 드는 옷 고르기. 시안: `design/atee-style-onboarding-sample.png`
 *
 * **최대 개수를 두지 않는다**(계획 §②). 후보가 12장이라 실질 상한이 12다.
 * 최소 3개는 서버도 같은 수로 거부한다 — 화면만 막으면 계약이 아니다.
 *
 * **카드는 사진뿐이다.** 브랜드·상품명을 쓰지 않는다 — 여기서 묻는 것은 "이 옷이
 * 마음에 드나"이지 "이 브랜드를 아나"가 아니다. 글자가 없는 만큼 상품명은
 * `aria-label`로 남긴다(안 그러면 보조기술이 "버튼"으로만 읽는다).
 *
 * 선택 표시에 **색만 쓰지 않는다** — 주황 테두리와 체크 아이콘을 함께 쓴다.
 */
export function OnboardingPickScreen({
  stepIndex,
  stepCount,
  candidates,
  onDead,
  loading,
  failed,
  onRetry,
  tooFew,
  selected,
  onToggle,
  minPicks,
  canGoNext,
  onBack,
  onNext,
  saving,
  saveFailed,
}: {
  stepIndex: number;
  stepCount: number;
  candidates: OnboardingCandidate[];
  onDead: (goodsNo: number) => void;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  tooFew: boolean;
  selected: number[];
  onToggle: (goodsNo: number) => void;
  minPicks: number;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
  saving: boolean;
  saveFailed: boolean;
}) {
  return (
    <main className="mx-auto min-h-svh max-w-md px-6 pb-40 text-ink">
      <OnboardingHeader index={stepIndex} count={stepCount} onBack={onBack} />

      <div className="mt-6">
        <h1 className="text-[26px] leading-tight font-bold text-ink">
          마음에 드는 옷을 골라주세요
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          {minPicks}개 이상 고르면 취향에 맞춰 추천해드려요.
        </p>
      </div>

      {loading && <PickSkeleton />}

      {failed && (
        <div role="status" className="mt-12 space-y-4 text-center">
          <p className="text-[15px] text-ink-soft">옷을 불러오지 못했어요.</p>
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded-full bg-app px-6 py-3 text-[15px] text-ink neo active:neo-in"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 자격을 잃은 후보를 빼고 나니 고를 것이 부족하다. 사람이 후보를 갈아야 한다는
          신호다 — 조용히 최소 개수를 낮추면 그 사실이 아무 데도 안 남는다.
          **"다시 시도"라고 쓰면 누를 것이 있어야 한다.** */}
      {tooFew && (
        <div role="status" className="mt-12 space-y-4 text-center">
          <p className="text-[15px] leading-relaxed text-ink-soft">
            지금 보여드릴 옷이 부족해요.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded-full bg-app px-6 py-3 text-[15px] text-ink neo active:neo-in"
          >
            다시 시도
          </button>
        </div>
      )}

      {!loading && !failed && !tooFew && (
        <ul className="mt-7 grid grid-cols-2 gap-4">
          {candidates.map((candidate) => (
            <li key={candidate.goodsNo}>
              <PickCard
                candidate={candidate}
                checked={selected.includes(candidate.goodsNo)}
                onToggle={onToggle}
                onDead={onDead}
              />
            </li>
          ))}
        </ul>
      )}

      {/* 시안의 하단 판 — **화면 아래에 붙은 평평한 판**이다. 떠 있는 카드가 아니다:
          위 모서리만 둥글고 그림자가 없다. 판이 있어야 스크롤되는 카드가 버튼 밑으로
          지나갈 때 글자가 겹쳐 읽히지 않는다.

          ⚠️ 여기에 그림자를 주면 안 된다. 버튼이 잠겨 흐려진 상태에서는 판의 그림자가
          유일하게 눈에 띄는 것이 되어, 판과 버튼이 하나의 뭉친 덩어리로 읽힌다. */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md rounded-t-[28px] bg-app px-4 pt-4 pb-6">
        {saveFailed && (
          <p role="status" className="mb-3 text-center text-sm text-danger">
            저장하지 못했어요. 다시 시도해 주세요.
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext || saving}
            className="w-full cursor-pointer rounded-[18px] bg-slate py-4 text-[17px] font-bold text-on-slate transition-opacity active:opacity-80 disabled:cursor-default disabled:opacity-45"
          >
            {saving
              ? "저장하는 중…"
              : canGoNext
                ? `${selected.length.toString()}개 선택했어요 · 계속`
                : `${minPicks}개 이상 골라주세요`}
          </button>
        </div>
      </div>
    </main>
  );
}

function PickCard({
  candidate,
  checked,
  onToggle,
  onDead,
}: {
  candidate: OnboardingCandidate;
  checked: boolean;
  onToggle: (goodsNo: number) => void;
  onDead: (goodsNo: number) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={
        candidate.brandName === null
          ? candidate.title
          : `${candidate.brandName} ${candidate.title}`
      }
      onClick={() => {
        onToggle(candidate.goodsNo);
      }}
      // 테두리가 아니라 아웃라인이다 — 테두리로 하면 고를 때마다 카드가 2px씩
      // 커졌다 작아져 격자가 흔들린다. `neo`는 border를 포함하므로 여기서는
      // 쓰지 않는다 — 대신 outline-color만 바꿔 선택 여부를 표시한다.
      className={`relative block w-full cursor-pointer overflow-hidden rounded-[20px] bg-thumb outline-2 ${
        checked ? "outline-accent" : "outline-line"
      }`}
    >
      <div className="relative aspect-5/6">
        <Image
          src={candidate.thumbnail}
          alt=""
          fill
          sizes="(max-width: 448px) 50vw, 224px"
          className="object-cover"
          // 이미지가 죽으면 **부모에게 알린다.** 여기서 혼자 숨기면 부모는 여전히
          // 12장으로 알고 있어, 보이는 카드가 2장뿐인데도 "3개 이상 골라주세요"만
          // 남는 막다른 화면이 된다. CDN 404는 클라이언트만 안다 — 전수 조사에서
          // 285건이 그랬다.
          onError={() => {
            onDead(candidate.goodsNo);
          }}
        />
        {checked && (
          <span
            aria-hidden
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-ink"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
              <path
                d="m5 12.5 4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * 뼈대는 **완성 레이아웃을 본뜬다** — 선 몇 개로 자리만 표시하면 화면이 바뀔 때
 * 형태가 튄다. 카드가 사진뿐이므로 뼈대도 사진 자리만 잡는다.
 */
function PickSkeleton() {
  return (
    <ul aria-hidden className="mt-7 grid grid-cols-2 gap-4">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-[20px] neo">
          <div className="aspect-5/6 animate-pulse bg-skel-1" />
        </li>
      ))}
    </ul>
  );
}
