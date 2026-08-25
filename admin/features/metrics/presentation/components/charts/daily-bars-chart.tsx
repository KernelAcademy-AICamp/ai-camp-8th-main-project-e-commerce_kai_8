import {
  type DailyBar,
  type DailyModel,
  labelPlan,
  monthDay,
  toDailyModel,
} from "../../../domain/daily-bars";
import type { MetricTable } from "../../../domain/metric";
import { niceScale } from "../../../domain/scale";

/** 그림 안의 좌표계. 화면 폭에 맞춰 늘어난다 */
const W = 560;
const H = 200;
const PAD_L = 52;
const PAD_T = 18;
const PAD_B = 46;
/** 이름표 하나가 필요로 하는 가로 폭 */
const LABEL_W = 32;
/** 막대가 아무리 좁아도 이만큼은 보인다 */
const MIN_BAR = 2;
const MAX_BAR = 24;

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 일별 기록 건수 막대.
 *
 * **막대 위에 숫자를 찍지 않는다.** 30일이면 칸이 17px라 숫자가 겹친다.
 * 다른 카드는 직접 찍지만 이 카드만 예외다 — 값은 `<title>`과 아래 표에 있다.
 *
 * **마크에 `tabindex`를 붙이지 않는다.** 전체 기간이면 정지점이 수십 개가 된다.
 */
export function DailyBarsChart({ table }: { table: MetricTable }) {
  const model = toDailyModel(table);
  if (model === null) return null;

  const scale = niceScale(model.max, 4);
  const plotH = H - PAD_T - PAD_B;
  const plotW = W - PAD_L - 8;
  const slot = plotW / model.bars.length;
  const barW = Math.max(MIN_BAR, Math.min(MAX_BAR, slot - 6));
  const labels = labelPlan(model.bars, slot, LABEL_W);
  const baseline = PAD_T + plotH;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={ariaLabel(model)}
        className="overflow-visible"
      >
        <text
          x={PAD_L - 8}
          y={PAD_T - 6}
          textAnchor="end"
          className="fill-neutral-500 text-[11px]"
        >
          건
        </text>

        {scale.ticks.map((tick) => {
          const y = baseline - (tick / scale.max) * plotH;
          return (
            <g key={tick}>
              <line
                x1={PAD_L}
                x2={W - 8}
                y1={y}
                y2={y}
                stroke={tick === 0 ? "#4a4a46" : "#2c2c2a"}
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-neutral-500 text-[11px] tabular-nums"
              >
                {fmt(tick)}
              </text>
            </g>
          );
        })}

        {model.bars.map((bar, index) => {
          const x = PAD_L + index * slot + (slot - barW) / 2;
          const h = scale.max > 0 ? (bar.value / scale.max) * plotH : 0;
          return (
            <g key={bar.iso}>
              <rect
                x={x}
                y={baseline - h}
                width={barW}
                height={Math.max(h, 0)}
                rx={Math.min(3, barW / 2)}
                fill="#3987e5"
              >
                <title>{barTitle(bar, model.weekly)}</title>
              </rect>
              {labels[index] && (
                <text
                  x={x + barW / 2}
                  y={baseline + 16}
                  textAnchor="middle"
                  className={
                    bar.monthStart
                      ? "fill-neutral-300 text-[11px] font-semibold"
                      : "fill-neutral-500 text-[11px]"
                  }
                >
                  {bar.label}
                </text>
              )}
            </g>
          );
        })}

        <text
          x={PAD_L + plotW / 2}
          y={H - 6}
          textAnchor="middle"
          className="fill-neutral-500 text-[11px]"
        >
          {caption(model)}
        </text>
      </svg>
    </div>
  );
}

/** 캡션은 **실제 범위에서 계산한다.** 「8월」처럼 박아 두면 화면이 틀린 말을 한다 */
function caption(model: DailyModel): string {
  return `${model.from} ~ ${model.to} · ${model.dayCount}일 · ${
    model.weekly ? "주 단위 묶음" : "일 단위"
  } (KST)`;
}

function barTitle(bar: DailyBar, weekly: boolean): string {
  const head = weekly
    ? `${monthDay(bar.iso)} ~ ${monthDay(bar.lastIso)} · ${fmt(bar.value)}건`
    : `${bar.iso} · ${fmt(bar.value)}건`;
  return bar.partial ? `${head} — ${bar.days}일치만 (아직 안 끝난 주)` : head;
}

function ariaLabel(model: DailyModel): string {
  return (
    `일별 기록 건수. ${model.from}부터 ${model.to}까지 ${model.dayCount}일, ` +
    `${model.weekly ? "주 단위로 묶어" : "하루씩"} 막대 ${model.bars.length}개. ` +
    `가장 큰 값 ${fmt(model.max)}건. 값은 아래 「숫자로 보기」 표에 있다.`
  );
}
