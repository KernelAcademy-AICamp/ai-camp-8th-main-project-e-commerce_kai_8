"use client";

import Image from "next/image";
import { useState } from "react";

import type { OnboardingCandidate } from "@/features/onboarding/domain/candidate";

import { OnboardingProgress } from "./onboarding-progress";

/**
 * 온보딩 2단계 — 마음에 드는 옷 고르기.
 *
 * **최대 개수를 두지 않는다**(계획 §②). 후보가 12장이라 실질 상한이 12다.
 * 최소 3개는 서버도 같은 수로 거부한다 — 화면만 막으면 계약이 아니다.
 *
 * 선택 표시에 **색만 쓰지 않는다** — 주황 테두리와 체크 아이콘을 함께 쓴다.
 */
export function OnboardingPickScreen({
  stepIndex,
  stepCount,
  candidates,
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
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  tooFew: boolean;
  selected: number[];
  onToggle: (goodsNo: number, cardPos: number) => void;
  minPicks: number;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
  saving: boolean;
  saveFailed: boolean;
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col px-6 py-8 pb-32 text-ink">
      <OnboardingProgress index={stepIndex} count={stepCount} />

      <div className="mt-8">
        <h1 className="text-2xl font-semibold text-ink">마음에 드는 옷을 골라주세요</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          고른 옷으로 첫 추천을 만듭니다.{" "}
          <span className="text-ink">최소 {minPicks}개</span>, 많이 고를수록 좋습니다.
        </p>
      </div>

      {loading && <PickSkeleton />}

      {failed && (
        <div role="status" className="mt-10 space-y-4 text-center">
          <p className="text-[15px] text-ink-soft">옷을 불러오지 못했습니다.</p>
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
          신호다 — 조용히 최소 개수를 낮추면 그 사실이 아무 데도 안 남는다. */}
      {tooFew && (
        <p role="status" className="mt-10 text-[15px] leading-relaxed text-ink-soft">
          지금 보여드릴 옷이 부족합니다. 잠시 뒤 다시 시도해 주세요.
        </p>
      )}

      {!loading && !failed && !tooFew && (
        <ul className="mt-6 grid grid-cols-2 gap-3">
          {candidates.map((candidate, index) => (
            <li key={candidate.goodsNo}>
              <PickCard
                candidate={candidate}
                cardPos={index}
                checked={selected.includes(candidate.goodsNo)}
                onToggle={onToggle}
              />
            </li>
          ))}
        </ul>
      )}

      <footer className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-app/95 px-6 pt-3 pb-6 backdrop-blur">
        {saveFailed && (
          <p role="status" className="mb-3 text-sm text-danger">
            저장하지 못했습니다. 다시 시도해 주세요.
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer rounded-full bg-app px-5 py-3 text-[15px] text-ink-soft neo active:neo-in"
          >
            뒤로
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext || saving}
            className="flex-1 cursor-pointer rounded-full bg-slate py-3 text-[15px] font-medium text-on-slate neo-drop active:neo-in disabled:cursor-default disabled:opacity-50"
          >
            {saving
              ? "저장하는 중…"
              : canGoNext
                ? `${selected.length.toString()}개 골랐어요 · 다음`
                : `${minPicks}개 이상 골라주세요`}
          </button>
        </div>
      </footer>
    </main>
  );
}

function PickCard({
  candidate,
  cardPos,
  checked,
  onToggle,
}: {
  candidate: OnboardingCandidate;
  cardPos: number;
  checked: boolean;
  onToggle: (goodsNo: number, cardPos: number) => void;
}) {
  // 이미지가 죽었으면 카드를 지운다 — 서버는 상품이 사라진 것만 알고, CDN이
  // 404를 내는 것은 여기서만 알 수 있다(전수 조사에서 285건이 그랬다).
  const [dead, setDead] = useState(false);
  if (dead) return null;

  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => {
        onToggle(candidate.goodsNo, cardPos);
      }}
      className={`block w-full cursor-pointer overflow-hidden rounded-2xl bg-thumb text-left ${
        checked ? "ring-2 ring-accent" : "neo"
      }`}
    >
      <div className="relative aspect-5/6">
        <Image
          src={candidate.thumbnail}
          alt=""
          fill
          sizes="(max-width: 448px) 50vw, 224px"
          className="object-cover"
          onError={() => {
            setDead(true);
          }}
        />
        {checked && (
          <span
            aria-hidden
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm text-white"
          >
            ✓
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-xs text-ink-muted">{candidate.brandName ?? " "}</p>
        <p className="truncate text-[13px] text-ink">{candidate.title}</p>
      </div>
    </button>
  );
}

/**
 * 뼈대는 **완성 레이아웃을 본뜬다** — 선 몇 개로 자리만 표시하면 화면이 바뀔 때
 * 형태가 튄다. 카드 비율·격자·글줄 위치를 실제와 같게 둔다.
 */
function PickSkeleton() {
  return (
    <ul aria-hidden className="mt-6 grid grid-cols-2 gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-2xl bg-thumb neo">
          <div className="aspect-5/6 animate-pulse bg-skel-1" />
          <div className="space-y-1.5 px-3 py-2">
            <div className="h-3 w-1/2 animate-pulse rounded bg-skel-1" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-skel-1" />
          </div>
        </li>
      ))}
    </ul>
  );
}
