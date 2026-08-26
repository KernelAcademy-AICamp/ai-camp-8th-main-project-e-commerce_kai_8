import Link from "next/link";

import type { MetricTable } from "../../../domain/metric";
import {
  FLOW_VIEWS,
  type FlowLeaf,
  type FlowView,
  toFlowModel,
} from "../../../domain/session-flow";
import { spreadLabels } from "../../../domain/spread-labels";

/** 그림 안의 좌표계. 화면 폭에 맞춰 늘어난다 */
const W = 1000;
const H = 330;
const NODE_W = 13;
const GAP = 8;
const PAD_T = 10;
const PAD_B = 10;
/** 이름표 두 줄이 겹치지 않으려면 이만큼은 떨어져야 한다 */
const LABEL_GAP = 30;
const COL_X = [0, W * 0.34, W * 0.665];

/** 갈래 색. 이탈은 회색, 행동은 파랑 계열 */
const LEAF_FILL: Record<string, string> = {
  wish_only: "#86b6ef",
  both: "#fab219",
  outbound_only: "#2a78d6",
  wish: "#86b6ef",
  outbound: "#2a78d6",
};
const DROP_FILL = "#5a5a56";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b > 0 ? ((100 * a) / b).toFixed(1) + "%" : "—");

interface Node {
  x: number;
  y: number;
  n: number;
  label: string;
  fill: string;
  /** 비율의 분모. null이면 맨 앞 단계 */
  base: number | null;
  col: number;
}

/**
 * 세션 흐름도.
 *
 * **마크에 `tabindex`를 붙이지 않는다.** 붙이면 탭 정지점이 갈래마다 생긴다.
 * 값을 키보드로 읽는 경로는 카드 아래 「숫자로 보기」 표다.
 * 마우스 툴팁은 `<title>`이 맡는다 — 스크립트 없이 뜬다.
 *
 * **좁혀 보기는 링크다.** 화면 탭·기간 선택기와 같은 방식이라 새 개념이 없고,
 * 주소를 복사해 넘기면 같은 화면이 열린다. SQL은 늘 다섯 갈래를 다 가져오고
 * 여기서 합치므로 **질의는 한 번만 돈다.**
 */
export function SessionFlowChart({
  table,
  view,
  hrefFor,
}: {
  table: MetricTable;
  view: FlowView;
  hrefFor: (view: FlowView) => string;
}) {
  const model = toFlowModel(table, view);
  if (model === null) return null;

  const plotH = H - PAD_T - PAD_B;
  const scale = (plotH - GAP * (model.leaves.length - 1)) / model.impressions;
  const height = (n: number) => Math.max(n * scale, 2.5);

  // 1열: 상품 노출 / 2열: 상품 클릭 + 클릭 없음 / 3열: 갈래들
  const nodes: Node[] = [
    {
      x: COL_X[0],
      y: PAD_T,
      n: model.impressions,
      label: "상품 노출",
      fill: "#b7d3f6",
      base: null,
      col: 0,
    },
    {
      x: COL_X[1],
      y: PAD_T,
      n: model.taps,
      label: "상품 클릭",
      fill: "#5598e7",
      base: model.impressions,
      col: 1,
    },
    {
      x: COL_X[1],
      y: PAD_T + height(model.taps) + GAP,
      n: model.dropped,
      label: "클릭 없음",
      fill: DROP_FILL,
      base: model.impressions,
      col: 1,
    },
  ];
  let cursor = PAD_T;
  for (const leaf of model.leaves) {
    nodes.push({
      x: COL_X[2],
      y: cursor,
      n: leaf.count,
      label: leaf.label,
      fill: leaf.dropOff ? DROP_FILL : (LEAF_FILL[leaf.key] ?? "#5598e7"),
      base: model.taps,
      col: 2,
    });
    cursor += height(leaf.count) + GAP;
  }

  const [impNode, tapNode, dropNode] = nodes;
  const leafNodes = nodes.slice(3);

  return (
    <div>
      <StepHeader model={model} />

      <div className="my-4 flex flex-wrap items-center gap-3">
        <ViewPicker current={view} hrefFor={hrefFor} />
        <p className="text-xs text-neutral-500">{overlapNote(view, model.overlap)}</p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={ariaLabel(model)}
      >
        {/* 띠를 먼저 그린다 — 마디가 위로 오게 */}
        <Ribbon
          from={impNode}
          to={tapNode}
          offset={0}
          size={model.taps}
          scale={scale}
          fill={tapNode.fill}
        />
        <Ribbon
          from={impNode}
          to={dropNode}
          offset={height(model.taps)}
          size={model.dropped}
          scale={scale}
          fill={DROP_FILL}
        />
        {leafNodes.map((leaf, i) => (
          <Ribbon
            key={leaf.label}
            from={tapNode}
            to={leaf}
            offset={model.leaves
              .slice(0, i)
              .reduce((sum, l) => sum + height(l.count) + GAP, 0)}
            size={leaf.n}
            scale={scale}
            fill={leaf.fill}
          />
        ))}

        {nodes.map((node) => (
          <rect
            key={`${node.col}-${node.label}`}
            x={node.x}
            y={node.y}
            width={NODE_W}
            height={height(node.n)}
            rx={2}
            fill={node.fill}
          >
            <title>
              {`${node.label} ${fmt(node.n)}개 세션`}
              {node.base === null
                ? " — 전체"
                : ` — ${pct(node.n, node.base)} · ${fmt(node.base)} 대비`}
            </title>
          </rect>
        ))}

        {[0, 1, 2].map((col) => (
          <ColumnLabels
            key={col}
            nodes={nodes.filter((n) => n.col === col)}
            height={height}
          />
        ))}
      </svg>

      <Summary model={model} />
      {model.unknown.length > 0 && (
        <p className="mt-3 text-xs text-amber-400">
          모르는 갈래가 있어 그림에서 뺐습니다: {model.unknown.join(", ")} — 아래 표에는
          있습니다.
        </p>
      )}
    </div>
  );
}

/** 마디와 마디를 잇는 띠. 두께가 세션 수다 */
function Ribbon({
  from,
  to,
  offset,
  size,
  scale,
  fill,
}: {
  from: Node;
  to: Node;
  offset: number;
  size: number;
  scale: number;
  fill: string;
}) {
  const x0 = from.x + NODE_W;
  const x1 = to.x;
  const y0 = from.y + offset;
  const y1 = to.y;
  const h = Math.max(size * scale, 2.5);
  const cx = x0 + (x1 - x0) * 0.5;
  const d =
    `M${x0},${y0}` +
    ` C${cx},${y0} ${cx},${y1} ${x1},${y1}` +
    ` L${x1},${y1 + h}` +
    ` C${cx},${y1 + h} ${cx},${y0 + h} ${x0},${y0 + h} Z`;
  return <path d={d} fill={fill} fillOpacity={0.3} />;
}

/**
 * 한 열의 이름표. 얇은 갈래는 마디가 7px도 안 되는데 이름표는 두 줄이라 26px가 필요하다.
 * **마디는 제자리에 두고 이름표만** 최소 간격으로 밀고, 밀린 만큼 잇는 선을 그린다.
 */
function ColumnLabels({
  nodes,
  height,
}: {
  nodes: Node[];
  height: (n: number) => number;
}) {
  const centers = nodes.map((node) => node.y + height(node.n) / 2);
  const placed = spreadLabels(centers, LABEL_GAP, PAD_T + 8, H - PAD_B - 8);
  return (
    <>
      {nodes.map((node, i) => {
        const nodeY = centers[i];
        const labelY = placed[i];
        const x = node.x + NODE_W;
        return (
          <g key={`${node.col}-${node.label}`}>
            {Math.abs(labelY - nodeY) > 2 && (
              <polyline
                points={`${x + 1},${nodeY} ${x + 5},${nodeY} ${x + 5},${labelY} ${x + 7},${labelY}`}
                fill="none"
                stroke="#4a4a46"
                strokeWidth={1}
              />
            )}
            <text
              x={x + 9}
              y={labelY - 1}
              className="fill-neutral-300 text-[11.5px] tabular-nums"
            >
              {node.label} {fmt(node.n)}
            </text>
            <text x={x + 9} y={labelY + 12} className="fill-neutral-500 text-[10.5px]">
              {node.base === null ? "전체" : pct(node.n, node.base)}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** 단계별 숫자. 흐름도만으로는 단계 전환율이 안 보여서 위에 얹는다 */
function StepHeader({ model }: { model: ReturnType<typeof toFlowModel> }) {
  if (model === null) return null;
  const steps = [
    { no: 1, ko: "상품 노출", en: "impression", n: model.impressions, of: null },
    { no: 2, ko: "상품 클릭", en: "tap", n: model.taps, of: model.impressions },
    { no: 3, ko: model.stepLabel, en: "", n: model.reached, of: model.taps },
  ];
  return (
    <div className="grid grid-cols-3">
      {steps.map((step, i) => (
        <div
          key={step.no}
          className={i === 0 ? "" : "border-l border-neutral-800 pl-4"}
        >
          <div className="text-[11px] text-neutral-500">{step.no}</div>
          <div className="mt-0.5 text-[12.5px] font-medium text-neutral-300">
            {step.ko}{" "}
            {step.en !== "" && (
              <span className="text-[11px] font-normal text-neutral-500">
                {step.en}
              </span>
            )}
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {fmt(step.n)}
          </div>
          <div className="text-[11px] text-neutral-500">
            {step.of === null
              ? "100% · 전체"
              : `${pct(step.n, step.of)} · 앞 단계 ${fmt(step.of)} 대비`}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 전체 전환율 · 총 이탈 · 가장 큰 이탈 구간 */
function Summary({ model }: { model: NonNullable<ReturnType<typeof toFlowModel>> }) {
  const dropToTap = model.impressions - model.taps;
  const dropToAct = model.taps - model.reached;
  const worst =
    dropToTap >= dropToAct
      ? { from: "상품 노출", to: "상품 클릭", lost: dropToTap }
      : { from: "상품 클릭", to: model.stepLabel, lost: dropToAct };
  const cells = [
    {
      label: "전체 전환율",
      value: pct(model.reached, model.impressions),
      note: `${fmt(model.reached)} / ${fmt(model.impressions)}`,
    },
    {
      label: "총 이탈",
      value: fmt(model.impressions - model.reached),
      note: "개 세션",
    },
    {
      label: "가장 큰 이탈 구간",
      value: `${worst.from} → ${worst.to}`,
      note: `${fmt(worst.lost)}개`,
    },
  ];
  return (
    <div className="mt-4 grid gap-0.5 sm:grid-cols-3">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-md bg-neutral-950/60 px-3 py-2.5">
          <div className="text-[11px] text-neutral-500">{cell.label}</div>
          <div className="mt-0.5 text-[15px] font-semibold tabular-nums">
            {cell.value}{" "}
            <span className="text-[11.5px] font-normal text-neutral-500">
              {cell.note}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 좁혀 보기. 링크라 자바스크립트가 필요 없고 주소에 남는다 */
function ViewPicker({
  current,
  hrefFor,
}: {
  current: FlowView;
  hrefFor: (view: FlowView) => string;
}) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-lg border border-neutral-800 bg-neutral-950/60 p-0.5"
      role="group"
      aria-label="마지막 단계"
    >
      {FLOW_VIEWS.map((v) => {
        const on = v.id === current;
        return (
          <Link
            key={v.id}
            href={hrefFor(v.id)}
            aria-current={on ? "true" : undefined}
            className={
              (on
                ? "bg-sky-600 font-medium text-white "
                : "text-neutral-400 hover:text-neutral-200 ") +
              "flex min-h-11 items-center rounded-md px-4 text-[13px]"
            }
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}

function overlapNote(view: FlowView, overlap: number): string {
  if (overlap === 0) return "찜과 판매처 이동을 둘 다 한 세션은 없습니다.";
  if (view === "wish")
    return `찜한 세션 중 ${fmt(overlap)}개는 판매처 이동도 했습니다.`;
  if (view === "outbound")
    return `판매처로 간 세션 중 ${fmt(overlap)}개는 찜도 했습니다.`;
  return `「둘 다」를 갈래로 뽑아 겹침을 없앴습니다 — 갈래를 더하면 노출 세션 수가 됩니다.`;
}

function ariaLabel(model: NonNullable<ReturnType<typeof toFlowModel>>): string {
  const leaves = model.leaves
    .map((leaf: FlowLeaf) => `${leaf.label} ${fmt(leaf.count)}`)
    .join(", ");
  return (
    `세션 흐름도. 상품 노출 ${fmt(model.impressions)}개 세션에서 상품 클릭 ${fmt(model.taps)}개로 이어지고, ` +
    `거기서 ${leaves}으로 갈라진다. 한 세션은 정확히 한 갈래에만 속한다. 값은 아래 「숫자로 보기」 표에 있다.`
  );
}
