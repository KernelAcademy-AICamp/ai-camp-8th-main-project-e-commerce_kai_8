// 지표 SQL 실행 — 결과를 domain 타입으로 바꿔 돌려준다.

import { type DashboardFilter, NO_FILTER, toParams } from "../domain/filters";
import { type MetricDefinition, type MetricResult, toTable } from "../domain/metric";
import { describeError, getPool } from "./db";

/**
 * 데이터베이스에 붙을 수 있는가.
 *
 * 카드를 돌리기 **전에** 따로 확인한다. 접속이 안 되는 상태로 카드를 돌리면 전부
 * 실패로 뜨는데, 그 화면은 "지표 6개가 다 깨졌다"처럼 보여 원인을 가린다.
 * 여기서 걸러 화면 전체에 한 번만 알린다 (설계 §7).
 *
 * @returns 문제가 없으면 null, 있으면 오류 문구
 */
export async function checkConnection(): Promise<string | null> {
  try {
    await getPool().query("select 1");
    return null;
  } catch (error) {
    return describeError(error);
  }
}

/**
 * SQL이 실제로 쓰는 파라미터 개수(`$1`,`$2`...의 최대 번호).
 *
 * 안 쓰는 카드에까지 값을 넘기면 데이터베이스가 개수 불일치로 거부한다. 그러면
 * 필터와 무관한 카드가 통째로 "실패"로 떠서 원인이 가려진다.
 */
export function countPlaceholders(sql: string): number {
  const found = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  return found.length === 0 ? 0 : Math.max(...found);
}

/** 카드 한 장. 실패해도 던지지 않는다 — 실패는 결과의 한 종류다 */
export async function runMetric(
  definition: MetricDefinition,
  filter: DashboardFilter = NO_FILTER,
): Promise<MetricResult> {
  try {
    const values = toParams(filter).slice(0, countPlaceholders(definition.sql));
    const result = await getPool().query(definition.sql, values);
    const columns = result.fields.map((field) => field.name);
    return {
      definition,
      outcome: { kind: "ok", table: toTable(columns, result.rows) },
    };
  } catch (error) {
    return { definition, outcome: { kind: "failed", message: describeError(error) } };
  }
}

/**
 * 카드 전체.
 *
 * 하나가 실패해도 나머지는 그대로 나온다 (설계 §7). 그래서 `Promise.all`을 쓰되
 * `runMetric`이 던지지 않게 만들어 뒀다 — 던지면 한 장 때문에 전체가 무너진다.
 */
export async function runMetrics(
  definitions: readonly MetricDefinition[],
  filter: DashboardFilter = NO_FILTER,
): Promise<MetricResult[]> {
  return Promise.all(definitions.map((definition) => runMetric(definition, filter)));
}
