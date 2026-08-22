"use client";

import { RefreshIcon } from "@/shared/icons";

import {
  AXES_IN_ORDER,
  colorChip,
  groupAxes,
  isStillCollecting,
  LEAD_AXIS,
  type TasteAxis,
  type TasteSummary,
} from "../../domain/taste-summary";
import { useTasteSummary } from "../view-model/use-taste-summary";
import { TasteCardSkeleton } from "./taste-card-skeleton";
import { TasteGuestSkeleton } from "./taste-guest-skeleton";

/** 색 칩과 브랜드는 몇 개 넘으면 읽히지 않는다. 서버는 더 보내도 화면이 줄인다. */
// 시안 `TASTE_MAX_COLORS` — 자주 본 색은 일곱까지 보인다
const MAX_COLORS = 7;
const MAX_BRANDS = 3;

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * 한 축의 막대.
 *
 * **채우지 않고 점을 찍는다.** 채우면 "얼마나 많이"로 읽히는데, 이 값은 양이
 * 아니라 **양 끝 사이의 위치**다.
 *
 * **잰 개수를 막대 옆에 숫자로 적지 않는다.** 축마다 적어 봤더니 숫자가 라벨과 한
 * 덩어리로 읽혀 막대를 방해했다(2026-08-20 화면 확인, 제품 책임자 판단). 개수는
 * `aria-label`과 카드 머리말에 남는다.
 *
 * ⚠️ 그래서 화면만 보면 **24개로 잰 막대와 50개로 잰 막대가 똑같아 보인다.**
 */
function AxisBar({ axis }: { axis: TasteAxis }) {
  const label = AXES_IN_ORDER.find((a) => a.key === axis.key);
  if (!label) return null;

  return (
    <li>
      <div className="flex items-center justify-between text-[11px] font-bold text-ink-soft">
        <span>{label.left}</span>
        <span>{label.right}</span>
      </div>
      <div
        role="img"
        aria-label={`${label.left}에서 ${label.right} 사이 ${percent(axis.value)} 지점, 상품 ${String(axis.measured)}개로 잼`}
        className="relative mt-3 h-1 rounded-full bg-line"
      >
        {/* 막대 **위**에서 아래를 가리키는 삼각형. 막대에 얹힌 동그라미는 막대를
            덮어 어디까지가 눈금인지 흐렸다 — 표시를 밖으로 빼면 막대가 온전히
            보이고, 뾰족한 끝이 한 점을 정확히 짚는다 (2026-08-22 제품 책임자). */}
        <span
          aria-hidden
          className="absolute bottom-[calc(100%+2px)] h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-solid border-x-transparent border-t-slate"
          style={{ left: `${String(axis.value * 100)}%` }}
        />
      </div>
    </li>
  );
}

/**
 * 카드 안의 한 묶음.
 *
 * **묶음 사이 간격을 축 사이 간격보다 크게 둔다.** 둘이 같으면 소제목이 묶음의
 * 머리가 아니라 그냥 떠 있는 글자로 읽힌다(2026-08-20 화면 확인).
 */
/**
 * 카드 안의 한 구역.
 *
 * 제목은 두 갈래다. **축 묶음의 제목**(색·프린트·값·실루엣)은 화면을 나누는
 * 이정표라 또렷해야 하고, **곁들이는 설명**(자주 본 색·브랜드)은 시안 `.tc-sub`
 * 대로 작고 연하다. 둘을 같은 색으로 두었더니 이정표가 바탕에 묻혔다 — 그 연한
 * 회색은 바탕 대비 2.08:1로 본문이 읽히는 밝기가 아니다(실측).
 */
function Section({
  title,
  caption = false,
  children,
}: {
  title: string;
  /** 시안 `.tc-sub` — 작고 연한 곁들임 제목 */
  caption?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={caption ? "mt-10" : "mt-11 first:mt-8"}>
      <h3
        className={
          caption
            ? "text-[11px] font-bold text-ink-muted"
            : "text-[12.5px] font-extrabold tracking-[0.02em] text-ink"
        }
      >
        {title}
      </h3>
      <div className={caption ? "mt-4" : "mt-5"}>{children}</div>
    </section>
  );
}

function TasteBody({ summary }: { summary: TasteSummary }) {
  const colors = summary.colors
    .map((c) => ({ ...c, chip: colorChip(c.group) }))
    .filter((c) => c.chip !== undefined)
    .slice(0, MAX_COLORS);
  const brands = summary.brands.slice(0, MAX_BRANDS);
  const lead = summary.axes.find((axis) => axis.key === LEAD_AXIS.key);

  return (
    <>
      {/* 무엇으로 잰 값인지 먼저 밝힌다. 축마다 잰 개수가 다르므로(색은 거의 다
          잡히고 실측 치수는 절반뿐이다) 이 수는 축별 숫자의 상한으로 읽힌다. */}
      <p className="mt-1 text-sm text-ink-muted">
        상품 {summary.matchedCount}개로 쟀어요
      </p>

      {/* 응집도는 어느 묶음에도 속하지 않는다. 소제목 없이 맨 위에 홀로 둬서
          "이건 다른 종류의 값"이라고 배치로 말한다. 앵커 20개를 못 채우면
          서버가 아예 안 보낸다 — 적은 앵커는 우연히 확고해 보이기 때문이다. */}
      {lead && (
        <ul className="mt-7">
          <AxisBar axis={lead} />
        </ul>
      )}

      {groupAxes(summary.axes).map((group) => (
        <Section key={group.key} title={group.title}>
          <ul className="space-y-6">
            {group.axes.map((axis) => (
              <AxisBar key={axis.key} axis={axis} />
            ))}
          </ul>
        </Section>
      ))}

      {colors.length > 0 && (
        <Section title="자주 본 색" caption>
          {/* 시안 `.tc-colors` — 알약 없이 동그란 색 아래 비율만. 이름은 적지 않는다. */}
          <ul className="flex flex-wrap gap-[18px]">
            {colors.map((color) => (
              <li key={color.group} className="text-center">
                <span
                  aria-label={color.chip?.label}
                  className="mx-auto mb-1.5 block h-6 w-6 rounded-full border border-ink/10"
                  style={{ backgroundColor: color.chip?.hex }}
                />
                <span className="text-[10px] font-bold text-ink-soft tabular-nums">
                  {percent(color.share)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {brands.length > 0 && (
        <Section title="자주 본 브랜드" caption>
          {/* 시안 `.tc-brands` — 이름은 진하게, 사이의 가운뎃점만 연하게 */}
          <p className="text-[12.5px] font-bold text-ink">
            {brands.map((b, i) => (
              <span key={b.name}>
                {i > 0 && <i className="mx-[7px] not-italic text-ink-muted">·</i>}
                {b.name}
              </span>
            ))}
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
 * **회원에게만 보인다.** 취향 프로필이 계정에 있으므로 자연스럽다. 비회원에게는
 * 내용 대신 **자리만** 남긴다 — 시안의 비회원 모드다. 아무것도 안 그리면 프로필이
 * 텅 비어 보이고, 그 위에 뜨는 로그인 안내가 무엇을 가리는지 알 수 없다.
 */
export function TasteCard() {
  const { state, refreshing, refresh } = useTasteSummary();

  if (state.kind === "hidden") return <TasteGuestSkeleton />;
  // 뼈대는 이동 중 화면과 공유한다 — 각자 그리면 도착하는 순간 깜빡인다
  if (state.kind === "loading") return <TasteCardSkeleton />;

  return (
    <section className="mt-10 rounded-2xl border border-line p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">내 취향</h2>
        {/* 세션 취향은 30분 쉬어야 반영되므로, "지금까지 본 것까지"를 원하면 이 버튼.
            불러오는 중 잠그는 일은 뼈대(TasteCardSkeleton)가 맡는다 — 여기까지 왔으면 끝났다 */}
        <button
          type="button"
          aria-label="지금까지 본 것까지 반영해 새로고침"
          onClick={refresh}
          disabled={refreshing}
          className={`-m-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-soft disabled:opacity-50 ${
            refreshing ? "animate-spin" : ""
          }`}
        >
          <RefreshIcon size={17} />
        </button>
      </div>

      {state.kind === "failed" && (
        <p role="status" className="mt-1 text-sm text-ink-muted">
          지금은 취향을 불러오지 못했어요
        </p>
      )}

      {/* 없는 것을 있는 척하지 않는다 */}
      {state.kind === "ready" && isStillCollecting(state.summary) && (
        <p className="mt-1 text-sm text-ink-muted">
          아직 모으는 중이에요. 마음에 드는 티셔츠를 눌러 보세요
        </p>
      )}

      {state.kind === "ready" && !isStillCollecting(state.summary) && (
        <TasteBody summary={state.summary} />
      )}
    </section>
  );
}
