import type { MetricTable } from "../../../domain/metric";

/**
 * 한 줄짜리 결과를 큰 숫자 칸으로 늘어놓는다.
 *
 * **그림이 아니라 배치다.** 표로 두면 값 하나를 보려고 가로로 훑어야 하는데,
 * 이 카드는 "계측이 살아 있나"를 스쳐 보는 용도라 한눈에 들어와야 한다.
 *
 * 컬럼 이름을 그대로 딱지로 쓴다. SQL이 정본이라는 성질이 여기서도 유지된다.
 */
export function KpiStripChart({ table }: { table: MetricTable }) {
  // 한 줄이 아니면 이 배치가 뜻을 잃는다. 표로 떨어진다.
  if (table.rows.length !== 1) return null;
  const row = table.rows[0];

  return (
    <div className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-4">
      {table.columns.map((column, index) => (
        <div key={column} className="rounded-md bg-neutral-950/60 px-4 py-3.5">
          <div className="text-[11.5px] text-neutral-500">{column}</div>
          <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">
            {row[index]}
          </div>
        </div>
      ))}
    </div>
  );
}
