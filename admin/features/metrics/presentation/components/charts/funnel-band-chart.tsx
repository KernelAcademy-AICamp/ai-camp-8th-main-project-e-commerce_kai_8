import { type FunnelModel, toFunnelModel } from "../../../domain/funnel-band";
import type { MetricTable } from "../../../domain/metric";

/** 그림 안의 좌표계 */
const W = 1000;
const H = 110;
/** 각 단계에서 앞쪽 이만큼은 평평하게 두고, 나머지에서 다음 단계로 좁아진다 */
const FLAT = 0.42;

/** 단계마다 짙어진다. 크기 순서가 있으므로 색도 순서를 갖는다 */
const SHADES = ["#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6"];

const fmt = (n: number) => n.toLocaleString("ko-KR");
const pct = (n: number) => `${n.toFixed(1)}%`;

/**
 * 좁아지는 띠로 그리는 일렬 퍼널.
 *
 * **갈래가 없는 퍼널에만 쓴다.** 한 대상이 두 갈래에 동시에 속할 수 있으면
 * 합이 맞지 않아 띠가 거짓말을 한다. 그건 세션 흐름도가 맡는다.
 *
 * 단계마다 **이름과 숫자를 직접 찍는다.** 단계가 서넛이라 자리가 넉넉하다.
 */
export function FunnelBandChart({ table }: { table: MetricTable }) {
  const model = toFunnelModel(table);
  if (model === null) return null;

  const n = model.steps.length;
  const colW = W / n;
  const cy = H / 2;
  const half = (value: number) => (value / model.top) * (H / 2 - 4);

  return (
    <div>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {model.steps.map((step, i) => (
          <div
            key={step.label}
            className={i === 0 ? "" : "border-l border-neutral-800 pl-3"}
          >
            <div className="text-[11px] text-neutral-500">{i + 1}</div>
            <div className="mt-0.5 text-[12.5px] font-medium text-neutral-300">
              {step.label}
            </div>
            <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
              {fmt(step.value)}
            </div>
            <div className="text-[11px] text-neutral-500">
              {step.ofPrev === null
                ? "100% · 전체"
                : `${pct(step.ofPrev)} · 앞 단계 대비`}
            </div>
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel(model)}
        className="mt-2.5"
      >
        {model.steps.map((step, i) => {
          const x0 = i === 0 ? 0 : i * colW;
          const x1 = i * colW + colW * FLAT;
          const h = half(step.value);
          let d = `M${x0},${cy - h} L${x1},${cy - h}`;
          if (i < n - 1) {
            const x2 = (i + 1) * colW;
            const h2 = half(model.steps[i + 1].value);
            const cx = x1 + (x2 - x1) * 0.5;
            d +=
              ` C${cx},${cy - h} ${cx},${cy - h2} ${x2},${cy - h2}` +
              ` L${x2},${cy + h2}` +
              ` C${cx},${cy + h2} ${cx},${cy + h} ${x1},${cy + h}`;
          } else {
            d += ` L${x1},${cy + h}`;
          }
          d += ` L${x0},${cy + h} Z`;
          return (
            <path
              key={step.label}
              d={d}
              fill={SHADES[Math.min(i, SHADES.length - 1)]}
              fillOpacity={0.92}
            >
              <title>
                {`${step.label} ${fmt(step.value)}`}
                {step.ofPrev === null
                  ? " — 맨 앞 단계"
                  : ` — 앞 단계 대비 ${pct(step.ofPrev)}`}
              </title>
            </path>
          );
        })}
      </svg>

      {model.impossible.length > 0 && (
        <p className="mt-3 rounded border border-amber-800 bg-amber-950/40 p-2.5 text-xs text-amber-200">
          <strong>뒤 단계가 앞 단계보다 큽니다</strong>: {model.impossible.join(", ")} —
          퍼널에서는 있을 수 없는 값입니다. 계측이 다른 것을 세고 있을 수 있습니다.
        </p>
      )}

      <div className="mt-4 grid gap-0.5 sm:grid-cols-3">
        <Cell
          label="전체 전환율"
          value={pct(model.overall)}
          note={`${fmt(model.steps[model.steps.length - 1].value)} / ${fmt(model.top)}`}
        />
        <Cell
          label="총 이탈"
          value={fmt(model.top - model.steps[model.steps.length - 1].value)}
          note="명"
        />
        <Cell
          label="가장 큰 이탈 구간"
          value={model.worst === null ? "—" : `${model.worst.from} → ${model.worst.to}`}
          note={model.worst === null ? "단계가 하나뿐" : `${fmt(model.worst.lost)}명`}
        />
      </div>
    </div>
  );
}

function Cell({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-md bg-neutral-950/60 px-3 py-2.5">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums">
        {value}{" "}
        <span className="text-[11.5px] font-normal text-neutral-500">{note}</span>
      </div>
    </div>
  );
}

function ariaLabel(model: FunnelModel): string {
  const steps = model.steps.map((s) => `${s.label} ${fmt(s.value)}`).join(" 다음 ");
  return `퍼널. ${steps}. 띠 두께가 그 단계의 수다. 값은 아래 「숫자로 보기」 표에 있다.`;
}
