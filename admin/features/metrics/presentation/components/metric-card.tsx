import { asLink, type MetricResult } from "../../domain/metric";

/**
 * 카드 한 장.
 *
 * **세 상태를 서로 다르게 보여준다** — 값이 있음 / 정상인데 0건 / 실패.
 * 셋을 뭉뚱그리면 "데이터가 없다"와 "못 읽었다"를 구분할 수 없다 (설계 §7).
 */
export function MetricCard({ result }: { result: MetricResult }) {
  const { definition, outcome } = result;
  const body =
    outcome.kind === "failed" ? (
      <Failure message={outcome.message} />
    ) : outcome.table.rows.length === 0 ? (
      <Empty columns={outcome.table.columns} />
    ) : (
      <Table columns={outcome.table.columns} rows={outcome.table.rows} />
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
          <p className="mt-1 text-sm text-neutral-400">{definition.why}</p>
        </summary>
        <div className="mt-4">{body}</div>
      </details>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
      <h2 className="text-base font-semibold text-neutral-100">{definition.title}</h2>
      <p className="mt-1 text-sm text-neutral-400">{definition.why}</p>
      <div className="mt-4">{body}</div>
    </section>
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

function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
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
            <tr key={rowIndex} className="odd:bg-neutral-900/40">
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
