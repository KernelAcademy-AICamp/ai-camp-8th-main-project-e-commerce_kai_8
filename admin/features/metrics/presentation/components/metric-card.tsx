import { asLink, type MetricResult, type MetricTable } from "../../domain/metric";
import type { FlowView } from "../../domain/session-flow";
import { BoxplotChart } from "./charts/boxplot-chart";
import { DailyBarsChart } from "./charts/daily-bars-chart";
import { FunnelBandChart } from "./charts/funnel-band-chart";
import { HBarsChart } from "./charts/hbars-chart";
import { KpiStripChart } from "./charts/kpi-strip-chart";
import { RetentionCurveChart } from "./charts/retention-curve-chart";
import { SessionFlowChart } from "./charts/session-flow-chart";

/**
 * 이 줄 수를 넘으면 뒷부분을 접는다.
 *
 * 날짜·활동 일수처럼 **시간이 갈수록 행이 느는** 표가 있다. 30일 기간이면 30줄이고,
 * 두 달이면 더 는다. 다 펴 두면 카드 하나가 화면을 통째로 먹는다.
 */
const ROWS_BEFORE_FOLD = 8;

/** 접기 이름표. 누를 수 있으므로 44px 이상 */
const FOLD_LABEL =
  "mt-2 inline-flex min-h-11 cursor-pointer items-center text-xs text-neutral-400 " +
  "underline underline-offset-2 hover:text-neutral-200";

/** 차트를 그리는 데 필요한, 카드 바깥에서 오는 것들 */
export interface ChartContext {
  /** 세션 흐름도가 지금 보고 있는 갈래 */
  flow: FlowView;
  /** 그 갈래를 바꾸는 주소를 만든다 */
  flowHref: (view: FlowView) => string;
}

/**
 * 카드 한 장.
 *
 * **세 상태를 서로 다르게 보여준다** — 값이 있음 / 정상인데 0건 / 실패.
 * 셋을 뭉뚱그리면 "데이터가 없다"와 "못 읽었다"를 구분할 수 없다 (설계 §7).
 * **차트가 붙어도 이 규칙은 그대로다** — 0건일 때 빈 그림을 그리면 고장으로 보인다.
 */
export function MetricCard({
  result,
  chartContext,
}: {
  result: MetricResult;
  chartContext?: ChartContext;
}) {
  const { definition, outcome } = result;
  const body =
    outcome.kind === "failed" ? (
      <Failure message={outcome.message} />
    ) : outcome.table.rows.length === 0 ? (
      <Empty columns={outcome.table.columns} />
    ) : (
      <Body definition={definition} table={outcome.table} chartContext={chartContext} />
    );

  // 접힌 카드는 제목·설명만 보이고 표는 눌러야 펼쳐진다. 브라우저 기본
  // <details>라 자바스크립트가 필요 없다.
  if (definition.collapsed) {
    return (
      <details className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
        <summary className="cursor-pointer list-none">
          <span className="text-base font-semibold text-neutral-100">
            {definition.title}
          </span>
          <span className="ml-2 text-xs text-neutral-500">(눌러서 펼치기)</span>
          <Why text={definition.why} />
        </summary>
        <div className="mt-4">{body}</div>
      </details>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
      <h2 className="text-base font-semibold text-neutral-100">{definition.title}</h2>
      <Why text={definition.why} />
      <div className="mt-4">{body}</div>
    </section>
  );
}

/**
 * 그림이 붙은 카드는 **그림 + 접힌 표**, 아니면 지금처럼 표.
 *
 * **표는 그림이 붙어도 사라지지 않는다.** 마크에 `tabindex`를 안 붙이므로 이 표가
 * 키보드로 값을 읽는 유일한 경로이고, 얇은 마크가 터치 영역 기준을 면제받는
 * 근거이기도 하다(WCAG 2.2 SC 2.5.8의 「Equivalent」 예외).
 */
function Body({
  definition,
  table,
  chartContext,
}: {
  definition: MetricResult["definition"];
  table: MetricTable;
  chartContext?: ChartContext;
}) {
  const chart =
    definition.chart === "kpi-strip" ? (
      <KpiStripChart table={table} />
    ) : definition.chart === "daily-bars" ? (
      <DailyBarsChart table={table} />
    ) : definition.chart === "funnel-band" ? (
      <FunnelBandChart table={table} />
    ) : definition.chart === "boxplot" ? (
      <BoxplotChart table={table} />
    ) : definition.chart === "retention-curve" ? (
      <RetentionCurveChart table={table} />
    ) : definition.chart === "hbars" ? (
      <HBarsChart table={table} />
    ) : definition.chart === "session-flow" && chartContext !== undefined ? (
      <SessionFlowChart
        table={table}
        view={chartContext.flow}
        hrefFor={chartContext.flowHref}
      />
    ) : null;

  // 그릴 수 없으면(모양이 안 맞거나 값이 전부 0) 조용히 표로 떨어진다.
  // 빈 그림을 그리는 것보다 표를 보여주는 편이 낫다.
  if (chart === null)
    return (
      <Table
        columns={table.columns}
        rows={table.rows}
        foldId={`fold-${definition.id}`}
      />
    );

  return (
    <>
      {chart}
      <details className="mt-5 border-t border-neutral-800 pt-3">
        <summary className="cursor-pointer list-none text-xs text-neutral-400 hover:text-neutral-200">
          숫자로 보기 ({table.rows.length}줄)
        </summary>
        <div className="mt-3">
          <Table
            columns={table.columns}
            rows={table.rows}
            foldId={`fold-${definition.id}`}
          />
        </div>
      </details>
    </>
  );
}

/**
 * 카드 설명. **줄바꿈으로 나눠 문단을 만든다.**
 *
 * 한 줄로 길게 이어 쓰면 읽는 사람이 어디까지가 한 뜻인지 못 가른다.
 * 지표 파일이 줄바꿈으로 끊으면 그대로 문단이 된다.
 */
function Why({ text }: { text?: string }) {
  const lines = (text ?? "").split("\n").filter((line) => line.trim() !== "");
  // 설명이 없으면 아무것도 안 그린다. 빈 자리를 남기면 제목과 그림 사이가 벌어진다.
  if (lines.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {lines.map((line) => (
        <p key={line} className="text-sm text-neutral-400">
          {line}
        </p>
      ))}
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <div className="rounded border border-red-900 bg-red-950/50 p-3">
      <p className="text-sm font-medium text-red-300">이 지표를 읽지 못했습니다</p>
      <p className="mt-1 font-mono text-xs break-all text-red-400">{message}</p>
    </div>
  );
}

function Empty({ columns }: { columns: string[] }) {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <p className="text-sm text-neutral-400">
        조회는 성공했고 <strong className="text-neutral-200">해당하는 행이 0건</strong>
        입니다.
      </p>
      {columns.length > 0 && (
        <p className="mt-1 text-xs text-neutral-500">컬럼: {columns.join(" · ")}</p>
      )}
    </div>
  );
}

/**
 * 표. 줄이 많으면 뒷부분을 접는다.
 *
 * **자바스크립트를 쓰지 않는다.** 숨은 체크상자를 켜고 끄는 것으로 CSS가 뒷줄을
 * 보였다 감췄다 한다. 표 하나를 그대로 두므로 칸 너비가 어긋나지 않는다 —
 * 표를 둘로 쪼개 하나를 `<details>`에 넣으면 두 표의 칸 폭이 따로 놀아 어긋난다.
 *
 * ⚠️ `peer-checked`는 **형제** 선택자라 표 안의 `<tr>`에는 안 먹는다. 체크상자는
 *    바깥 `<div>`에 있고 행은 `<table><tbody>` 안이라 형제가 아니다. 그래서
 *    `group-has-[:checked]`(자손 선택)를 쓴다.
 *
 * **접힌 줄이 몇 개인지 보여준다.** 안 보이면 전체를 보고 있다고 착각한다.
 */
function Table({
  columns,
  rows,
  foldId,
}: {
  columns: string[];
  rows: string[][];
  foldId?: string;
}) {
  const folded = foldId !== undefined && rows.length > ROWS_BEFORE_FOLD;
  const hiddenCount = folded ? rows.length - ROWS_BEFORE_FOLD : 0;
  return (
    <div className="group overflow-x-auto">
      {folded && <input type="checkbox" id={foldId} className="sr-only" />}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="border-b border-neutral-700 px-3 py-2 text-left font-medium whitespace-nowrap text-neutral-400"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            // 행에 고유 키가 없다 — 조회 결과라 식별자를 보장할 수 없다.
            // 정적 표라 순서가 바뀌지 않으므로 인덱스로 충분하다.
            <tr
              key={rowIndex}
              className={
                folded && rowIndex >= ROWS_BEFORE_FOLD
                  ? "hidden odd:bg-neutral-900/40 group-has-[:checked]:table-row"
                  : "odd:bg-neutral-900/40"
              }
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={columns[cellIndex] ?? cellIndex}
                  className="border-b border-neutral-800/60 px-3 py-2 whitespace-nowrap text-neutral-200 tabular-nums"
                >
                  <Cell value={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {folded && (
        <>
          {/* 두 이름표를 겹쳐 두고 상태에 따라 하나만 보인다. 한 이름표 안의
              글자를 바꾸려면 그 글자가 체크상자의 형제여야 하는데 아니라서다. */}
          <label
            htmlFor={foldId}
            className={FOLD_LABEL + " group-has-[:checked]:hidden"}
          >
            {hiddenCount}줄 더 보기
          </label>
          <label
            htmlFor={foldId}
            className={FOLD_LABEL + " hidden group-has-[:checked]:inline-flex"}
          >
            뒤 {hiddenCount}줄 접기
          </label>
        </>
      )}
    </div>
  );
}

/** 주소면 누를 수 있게, 아니면 그냥 글자 */
function Cell({ value }: { value: string }) {
  const link = asLink(value);
  if (link === null) return <>{value}</>;
  return (
    <a
      href={link.href}
      {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
    >
      {link.label}
    </a>
  );
}
