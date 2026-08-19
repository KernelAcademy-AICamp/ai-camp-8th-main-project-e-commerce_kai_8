"use client";

import { RefreshIcon } from "@/shared/icons";

import {
  AXES_IN_ORDER,
  colorChip,
  isStillCollecting,
  type TasteAxis,
  type TasteSummary,
} from "../../domain/taste-summary";
import { useTasteSummary } from "../view-model/use-taste-summary";

/** 색 칩과 브랜드는 몇 개 넘으면 읽히지 않는다. 서버는 더 보내도 화면이 줄인다. */
const MAX_COLORS = 5;
const MAX_BRANDS = 3;

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * 한 축의 막대.
 *
 * **채우지 않고 점을 찍는다.** 채우면 "얼마나 많이"로 읽히는데, 이 값은 양이
 * 아니라 **양 끝 사이의 위치**다.
 */
function AxisBar({ axis }: { axis: TasteAxis }) {
  const label = AXES_IN_ORDER.find((a) => a.key === axis.key);
  if (!label) return null;

  return (
    <li>
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{label.left}</span>
        <span>{label.right}</span>
      </div>
      <div
        role="img"
        aria-label={`${label.left}에서 ${label.right} 사이 ${percent(axis.value)} 지점, 상품 ${String(axis.measured)}개로 잼`}
        className="relative mt-1.5 h-1 rounded-full bg-neutral-800"
      >
        <span
          aria-hidden
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{ left: `${String(axis.value * 100)}%` }}
        />
      </div>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="text-xs font-medium text-neutral-500">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TasteBody({ summary }: { summary: TasteSummary }) {
  const colors = summary.colors
    .map((c) => ({ ...c, chip: colorChip(c.group) }))
    .filter((c) => c.chip !== undefined)
    .slice(0, MAX_COLORS);
  const brands = summary.brands.slice(0, MAX_BRANDS);

  return (
    <>
      {summary.axes.length > 0 && (
        <ul className="mt-6 space-y-7">
          {summary.axes.map((axis) => (
            <AxisBar key={axis.key} axis={axis} />
          ))}
        </ul>
      )}

      {colors.length > 0 && (
        <Section title="자주 본 색">
          <ul className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <li
                key={color.group}
                className="flex items-center gap-2 rounded-full border border-neutral-800 py-1.5 pr-3 pl-1.5"
              >
                <span
                  aria-hidden
                  className="h-5 w-5 rounded-full border border-white/10"
                  style={{ backgroundColor: color.chip?.hex }}
                />
                <span className="text-sm text-neutral-300">{color.chip?.label}</span>
                <span className="text-xs text-neutral-500">{percent(color.share)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {brands.length > 0 && (
        <Section title="자주 본 브랜드">
          <p className="text-sm text-neutral-300">
            {brands.map((b) => b.name).join(" · ")}
          </p>
        </Section>
      )}
    </>
  );
}

/**
 * 내 취향 카드 — 앵커 상품들의 **경향**만 보여준다.
 *
 * **개별 상품을 깔지 않는다.** 앵커 가중치는 찜·판매처 이동이 크게 잡히므로
 * 상위 몇 개를 썸네일로 내보내면 찜 목록의 축소판이 된다(설계 §4).
 *
 * **회원에게만 보인다.** 취향 프로필이 계정에 있으므로 자연스럽다.
 */
export function TasteCard() {
  const { state, refreshing, refresh } = useTasteSummary();

  if (state.kind === "hidden") return null;

  return (
    <section className="mt-10 rounded-2xl border border-neutral-800 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">내 취향</h2>
        {/* 세션 취향은 30분 쉬어야 반영되므로, "지금까지 본 것까지"를 원하면 이 버튼 */}
        <button
          type="button"
          aria-label="지금까지 본 것까지 반영해 새로고침"
          onClick={refresh}
          disabled={refreshing || state.kind === "loading"}
          className={`-m-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-neutral-400 disabled:opacity-50 ${
            refreshing ? "animate-spin" : ""
          }`}
        >
          <RefreshIcon size={17} />
        </button>
      </div>

      {state.kind === "loading" && (
        <div aria-label="불러오는 중" className="mt-6 animate-pulse space-y-7">
          <div className="h-1 rounded-full bg-neutral-800" />
          <div className="h-1 rounded-full bg-neutral-800" />
        </div>
      )}

      {state.kind === "failed" && (
        <p role="status" className="mt-1 text-sm text-neutral-500">
          지금은 취향을 불러오지 못했어요
        </p>
      )}

      {/* 없는 것을 있는 척하지 않는다 */}
      {state.kind === "ready" && isStillCollecting(state.summary) && (
        <p className="mt-1 text-sm text-neutral-500">
          아직 모으는 중이에요. 마음에 드는 티셔츠를 눌러 보세요
        </p>
      )}

      {state.kind === "ready" && !isStillCollecting(state.summary) && (
        <TasteBody summary={state.summary} />
      )}
    </section>
  );
}
