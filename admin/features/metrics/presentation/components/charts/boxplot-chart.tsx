import { type BoxRow, toBoxplotModel } from "../../../domain/boxplot";
import type { MetricTable } from "../../../domain/metric";

const W = 1000;
const ROW_H = 62;
const PAD_L = 128;
const PAD_R = 116;
const PAD_T = 12;

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 상자수염. **줄마다 자기 가로축을 갖는다.**
 *
 * 축을 공유하면 아래 줄들이 실오라기가 된다 — 본 상품 수는 상위 25%가 92인데
 * 판매처 이동은 0.1이다. 축이 다르다는 것은 범례가 말한다.
 *
 * 최댓값은 축에 안 넣고 오른쪽에 글자로 낸다. 1,457을 축에 넣으면 상자가 6% 폭이 된다.
 */
export function BoxplotChart({ table }: { table: MetricTable }) {
  const model = toBoxplotModel(table);
  if (model === null) return null;

  const H = PAD_T + model.rows.length * ROW_H + 8;
  const plotW = W - PAD_L - PAD_R;

  return (
    <div>
      <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-neutral-500">
        <Key
          swatch={
            <rect
              x="0"
              y="1"
              width="26"
              height="10"
              rx="2"
              fill="#3987e5"
              fillOpacity={0.28}
              stroke="#3987e5"
              strokeOpacity={0.5}
            />
          }
        >
          가운데 절반 (하위 25% ~ 상위 25%)
        </Key>
        <Key
          swatch={<rect width="2.5" height="14" fill="#ffffff" />}
          width={4}
          height={14}
        >
          중앙값
        </Key>
        <Key
          swatch={
            <circle
              cx="6"
              cy="6"
              r="4.5"
              fill="#171717"
              stroke="#fab219"
              strokeWidth={2}
            />
          }
          width={12}
          height={12}
        >
          평균 (참고값)
        </Key>
        <span>가로축은 줄마다 범위가 다르다</span>
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={ariaLabel(model.rows)}
        className="overflow-visible"
      >
        {model.rows.map((row, index) => {
          const top = PAD_T + index * ROW_H;
          const cy = top + 21;
          const ay = top + 40;
          const x = (value: number) =>
            PAD_L + Math.min(value / row.scale.max, 1) * plotW;
          const boxW = Math.max(x(row.q3) - x(row.q1), 3);
          return (
            <g key={row.label}>
              <text
                x={PAD_L - 14}
                y={cy + 4}
                textAnchor="end"
                className="fill-neutral-300 text-[11.5px]"
              >
                {row.label}
              </text>

              <line x1={PAD_L} x2={PAD_L + plotW} y1={ay} y2={ay} stroke="#4a4a46" />
              {row.scale.ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={x(tick)}
                    x2={x(tick)}
                    y1={ay}
                    y2={ay + 4}
                    stroke="#4a4a46"
                  />
                  <text
                    x={x(tick)}
                    y={ay + 16}
                    textAnchor="middle"
                    className="fill-neutral-500 text-[11px] tabular-nums"
                  >
                    {tick}
                  </text>
                </g>
              ))}

              <rect
                x={x(row.q1)}
                y={cy - 11}
                width={boxW}
                height={22}
                rx={3}
                fill="#3987e5"
                fillOpacity={0.28}
                stroke="#3987e5"
                strokeOpacity={0.5}
              >
                <title>{`${row.label} 가운데 절반 ${row.q1} ~ ${row.q3} — 세션을 크기순으로 줄 세웠을 때 가운데 50%`}</title>
              </rect>
              <line
                x1={x(row.median)}
                x2={x(row.median)}
                y1={cy - 13}
                y2={cy + 13}
                stroke="#ffffff"
                strokeWidth={2.5}
              >
                <title>{`${row.label} 중앙값 ${row.median} — 딱 가운데 세션의 값`}</title>
              </line>
              <circle
                cx={x(row.mean)}
                cy={cy}
                r={5}
                fill="#171717"
                stroke="#fab219"
                strokeWidth={2}
              >
                <title>{`${row.label} 평균 ${row.mean} — 전체를 더해 세션 수로 나눈 값`}</title>
              </circle>

              {/* 값을 직접 찍는다 — 줄이 넷이라 자리가 넉넉하다 */}
              <text
                x={PAD_L - 14}
                y={cy + 17}
                textAnchor="end"
                className="fill-neutral-500 text-[10.5px] tabular-nums"
              >
                중앙 {row.median} · 평균 {row.mean}
              </text>
              <text
                x={PAD_L + plotW + 12}
                y={cy + 4}
                className="fill-neutral-500 text-[11px] tabular-nums"
              >
                {row.clipped ? "› " : ""}최대 {fmt(row.max)}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="mt-2 text-center text-[11px] text-neutral-500">
        한 세션당 횟수 (개)
      </p>
      {model.rows.some((row) => row.clipped) && (
        <p className="mt-1 text-center text-[11px] text-neutral-500">
          › 표시는 최댓값이 축 밖에 있다는 뜻이다. 축에 넣으면 상자가 실오라기가 된다.
        </p>
      )}
    </div>
  );
}

function Key({
  swatch,
  width = 26,
  height = 12,
  children,
}: {
  swatch: React.ReactNode;
  width?: number;
  height?: number;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={width} height={height} aria-hidden="true">
        {swatch}
      </svg>
      {children}
    </span>
  );
}

function ariaLabel(rows: BoxRow[]): string {
  const summary = rows
    .map(
      (row) =>
        `${row.label} 중앙값 ${row.median} 평균 ${row.mean} 최대 ${fmt(row.max)}`,
    )
    .join(", ");
  return `세션 요약 상자수염. ${summary}. 줄마다 가로축 범위가 다르다. 값은 아래 「숫자로 보기」 표에 있다.`;
}
