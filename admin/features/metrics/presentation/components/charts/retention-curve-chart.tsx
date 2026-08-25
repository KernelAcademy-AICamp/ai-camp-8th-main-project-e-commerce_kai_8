import type { MetricTable } from "../../../domain/metric";
import {
  barHeight,
  labelBelow,
  type RetentionModel,
  THIN_COHORT,
  toRetentionModel,
} from "../../../domain/retention-curve";

const W = 640;
const H = 268;
const PAD_L = 46;
const PAD_R = 10;
const PAD_T = 18;
/** 비율 선이 차지하는 높이 */
const LINE_H = 104;
/** 선과 막대 사이. 캡션이 막대 위 숫자와 겹치지 않게 띄운다 */
const CAP_H = 30;
const BAR_H = 38;

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 재방문 곡선. 위에 비율 선, 아래에 코호트 막대.
 *
 * **두 눈금을 겹치지 않는다.** 한 그림에 축 두 개를 포개면 둘 중 하나는 반드시
 * 거짓말이 된다. 세로로 나눠 각자 축을 갖게 한다.
 *
 * **Day N 당일에 왔나**를 본다. 그래서 곡선이 톱니처럼 오르내린다 — 고장이 아니다.
 */
export function RetentionCurveChart({ table }: { table: MetricTable }) {
  const model = toRetentionModel(table);
  if (model === null) return null;

  const { points, rateScale, maxCohort } = model;
  const plotW = W - PAD_L - PAD_R;
  const x = (index: number) =>
    PAD_L + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (rate: number) => PAD_T + LINE_H - (rate / rateScale.max) * LINE_H;
  const barTop = PAD_T + LINE_H + CAP_H + 14;
  const barW = Math.max(4, Math.min(24, plotW / points.length - 8));
  const line = points
    .map((point, index) =>
      point.rate === null ? null : `${x(index)},${y(point.rate)}`,
    )
    .filter((pair) => pair !== null)
    .join(" ");

  return (
    <div>
      <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-neutral-500">
        <span className="inline-flex items-center gap-1.5">
          <svg width="26" height="12" aria-hidden="true">
            <line x1="0" y1="6" x2="26" y2="6" stroke="#3987e5" strokeWidth={2} />
            <circle
              cx="13"
              cy="6"
              r="4"
              fill="#3987e5"
              stroke="#171717"
              strokeWidth={2}
            />
          </svg>
          Retention rate (%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="12" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="10"
              height="9"
              rx="1.5"
              fill="#898781"
              fillOpacity={0.45}
            />
          </svg>
          Cohort size
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="12" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="10"
              height="9"
              rx="1.5"
              fill="#fab219"
              fillOpacity={0.55}
            />
          </svg>
          코호트 {THIN_COHORT} 미만
        </span>
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={ariaLabel(model)}
      >
        <text
          x={PAD_L - 8}
          y={PAD_T - 6}
          textAnchor="end"
          className="fill-neutral-500 text-[11px]"
        >
          %
        </text>
        {rateScale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? "#4a4a46" : "#2c2c2a"}
            />
            <text
              x={PAD_L - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-neutral-500 text-[11px] tabular-nums"
            >
              {tick}
            </text>
          </g>
        ))}

        {line !== "" && (
          <polyline
            points={line}
            fill="none"
            stroke="#3987e5"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {points.map((point, index) =>
          point.rate === null ? null : (
            <g key={point.day}>
              <circle
                cx={x(index)}
                cy={y(point.rate)}
                r={5}
                fill="#3987e5"
                stroke="#171717"
                strokeWidth={2}
              >
                <title>
                  {`Day ${point.day} retention ${point.rate.toFixed(1)}% — retained ${point.retained} / cohort ${point.cohort}`}
                  {point.thin ? " (표본이 얇다)" : ""}
                </title>
              </circle>
              {/* 값을 직접 찍는다 — 점이 열 개 남짓이라 자리가 있다.
                  위가 좁으면 아래로 뒤집는다. 안 그러면 「%」 축 표시와 겹친다. */}
              <text
                x={x(index)}
                y={
                  labelBelow(y(point.rate), PAD_T)
                    ? y(point.rate) + 15
                    : y(point.rate) - 11
                }
                textAnchor="middle"
                className="fill-neutral-400 text-[10.5px] tabular-nums"
              >
                {point.rate.toFixed(1)}
              </text>
            </g>
          ),
        )}

        <text x={PAD_L} y={barTop - 22} className="fill-neutral-500 text-[11px]">
          Cohort size (기기 수)
        </text>
        {points.map((point, index) => {
          const h = barHeight(point.cohort, maxCohort, BAR_H);
          return (
            <g key={point.day}>
              <rect
                x={x(index) - barW / 2}
                y={barTop + BAR_H - h}
                width={barW}
                height={h}
                rx={2}
                // 흐리게 하지 않는다 — 안 보이면 0으로 읽힌다. 색으로 구분한다.
                fill={point.thin ? "#fab219" : "#898781"}
                fillOpacity={point.thin ? 0.55 : 0.45}
              >
                <title>
                  {`Day ${point.day} cohort size ${point.cohort}`}
                  {point.thin
                    ? ` — ${THIN_COHORT}개 미만이라 비율을 결론으로 읽으면 안 된다`
                    : ""}
                </title>
              </rect>
              <text
                x={x(index)}
                y={barTop + BAR_H - h - 4}
                textAnchor="middle"
                className={
                  point.thin
                    ? "fill-amber-500/70 text-[10.5px] tabular-nums"
                    : "fill-neutral-500 text-[10.5px] tabular-nums"
                }
              >
                {point.cohort}
              </text>
              <text
                x={x(index)}
                y={barTop + BAR_H + 16}
                textAnchor="middle"
                className="fill-neutral-500 text-[11px]"
              >
                {point.day}
              </text>
            </g>
          );
        })}

        <text
          x={PAD_L + plotW / 2}
          y={H - 4}
          textAnchor="middle"
          className="fill-neutral-500 text-[11px]"
        >
          Day
        </text>
      </svg>
    </div>
  );
}

function ariaLabel(model: RetentionModel): string {
  const list = model.points
    .map(
      (point) =>
        `Day ${point.day} ${point.rate === null ? "값 없음" : `${point.rate.toFixed(1)}%`}` +
        ` (코호트 ${fmt(point.cohort)})`,
    )
    .join(", ");
  return `재방문 곡선. Day N 당일에 다시 온 기기의 비율. ${list}. 값은 아래 「숫자로 보기」 표에 있다.`;
}
