import { toHBarsModel } from "../../../domain/hbars";
import type { MetricTable } from "../../../domain/metric";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 가로 막대. 첫 칸이 이름, 둘째 칸이 막대, 나머지는 글자.
 *
 * **머리글을 붙인다.** 예전 목업에서 `36개 / 7일`이라고만 찍혀 슬래시 뒤가
 * 무엇인지 알 방법이 없었다.
 *
 * **값을 직접 찍는다** — 줄이 몇 개뿐이라 자리가 넉넉하다. 그래서 이 그림에는
 * 툴팁이 없어도 값을 다 읽을 수 있다.
 *
 * **막대로 그리지 않는 칸이 있다.** 관측 일수처럼 길이로 비교할 것이 아닌 값은
 * 글자로 옆에 붙인다. 막대로 그리면 "관측 일수가 많다 = 좋다"로 읽힌다.
 */
export function HBarsChart({ table }: { table: MetricTable }) {
  const model = toHBarsModel(table);
  if (model === null) return null;

  const labelColumn = table.columns[0];
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-neutral-700 px-2 py-2 text-right text-[11.5px] font-medium whitespace-nowrap text-neutral-400">
                {labelColumn}
              </th>
              <th className="w-full border-b border-neutral-700 px-2 py-2 text-left text-[11.5px] font-medium text-neutral-400">
                {model.valueColumn}
              </th>
              {model.rows[0].extras.map((extra) => (
                <th
                  key={extra.column}
                  className="border-b border-neutral-700 px-2 py-2 text-right text-[11.5px] font-medium whitespace-nowrap text-neutral-400"
                >
                  {extra.column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <tr key={row.label}>
                <td className="border-b border-neutral-800/60 px-2 py-2 text-right whitespace-nowrap text-neutral-200 tabular-nums">
                  {row.label}
                </td>
                <td className="border-b border-neutral-800/60 px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3.5 rounded-r-[3px] bg-[#3987e5]"
                      style={{
                        width: `${String((100 * row.value) / model.scale.max)}%`,
                      }}
                      title={`${row.label} — ${model.valueColumn} ${fmt(row.value)}`}
                    />
                    <span className="text-xs text-neutral-300 tabular-nums">
                      {fmt(row.value)}
                    </span>
                  </div>
                </td>
                {row.extras.map((extra) => (
                  <td
                    key={extra.column}
                    className="border-b border-neutral-800/60 px-2 py-2 text-right whitespace-nowrap text-neutral-500 tabular-nums"
                  >
                    {extra.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        가로축 최대 {fmt(model.scale.max)} · {model.valueColumn} 합계 {fmt(model.total)}
      </p>
    </div>
  );
}
