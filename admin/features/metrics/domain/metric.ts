// 지표 카드의 형태와 순수 규칙. 프레임워크·DB에 의존하지 않는다.
// 설계: docs/superpowers/specs/2026-08-20-admin-event-dashboard-design.md §4

/**
 * 대시보드 카드 하나의 정의. `admin/metrics/`의 파일들이 이 모양을 따른다.
 *
 * 새 지표를 넣는 방법 = 이 모양의 파일을 하나 만들고 `metrics/index.ts` 명단에
 * 추가하는 것. 화면 코드는 건드리지 않는다.
 */
export interface MetricDefinition {
  /** 파일마다 고유. 화면 키와 오류 표시에 쓴다 */
  id: string;
  /** 카드 제목 */
  title: string;
  /** 왜 보는지 한 줄. 숫자만 있으면 나중에 왜 봤는지 모른다 */
  why: string;
  /** 대시보드에서의 순서. 작을수록 위 */
  order: number;
  /**
   * 읽기 전용 SQL.
   *
   * **repo의 파일에서만 온다.** 브라우저 입력에서 오는 SQL은 실행하지 않는다
   * (설계 §4). 컬럼 이름이 그대로 표 머리글이 되므로 별칭을 읽기 좋게 붙인다.
   */
  sql: string;
}

/** 표 하나. 컬럼 이름은 SQL 결과에서 그대로 가져온다 */
export interface MetricTable {
  columns: string[];
  rows: string[][];
}

/**
 * 카드 한 장의 결과.
 *
 * **`ok`이면서 행이 0개인 것과 `failed`는 다른 상태다.** 둘을 같게 다루면
 * "데이터가 없다"와 "못 읽었다"를 구분할 수 없다 (설계 §7).
 */
export type MetricOutcome =
  { kind: "ok"; table: MetricTable } | { kind: "failed"; message: string };

export interface MetricResult {
  definition: MetricDefinition;
  outcome: MetricOutcome;
}

/**
 * 화면 전체의 상태.
 *
 * 접속 자체가 실패한 것은 카드별 실패와 급이 다르다 — 모든 카드가 0으로 보이는
 * 대신 화면 전체에 알려야 한다 (설계 §7).
 */
export type DashboardState =
  | { kind: "connection-failed"; message: string }
  | { kind: "loaded"; results: MetricResult[] };

/** 정의된 순서대로. order가 같으면 id 사전순 — 화면 순서가 흔들리지 않게 한다 */
export function sortMetrics(
  definitions: readonly MetricDefinition[],
): MetricDefinition[] {
  return [...definitions].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** 중복된 id 목록. 중복이 있으면 화면 키가 겹쳐 카드가 사라진다 */
export function findDuplicateIds(definitions: readonly MetricDefinition[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const definition of definitions) {
    if (seen.has(definition.id)) duplicates.add(definition.id);
    seen.add(definition.id);
  }
  return [...duplicates].sort();
}

/**
 * SQL이 읽기 전용으로 보이는가.
 *
 * 데이터베이스 계정이 이미 쓰기를 거부하므로(설계 §2-2) 이것은 **두 번째 방어선**이다.
 * 그럼에도 두는 이유는, DB가 거부하면 카드 하나가 조용히 "실패"로 뜰 뿐이라
 * 지표 파일에 쓰기 SQL이 섞였다는 사실 자체를 아무도 모르기 때문이다.
 * 여기서 걸리면 테스트가 이름을 대며 실패한다.
 */
const WRITE_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "truncate",
  "alter",
  "create",
  "grant",
  "revoke",
];

export function findWriteKeywords(sql: string): string[] {
  // 주석과 문자열 안의 단어까지 잡을 필요는 없다 — 목적은 실수 발견이지 방어가 아니다.
  const lowered = sql.toLowerCase();
  return WRITE_KEYWORDS.filter((keyword) =>
    new RegExp(`\\b${keyword}\\b`).test(lowered),
  );
}

/**
 * 조회 결과를 표로 바꾼다.
 *
 * 컬럼은 **결과가 0행이어도** 유지된다. 컬럼까지 사라지면 "정상적으로 0건"인
 * 카드가 빈 상자로 보여 실패와 구분되지 않는다.
 */
export function toTable(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): MetricTable {
  return {
    columns: [...columns],
    rows: rows.map((row) => columns.map((column) => formatCell(row[column]))),
  };
}

/** 표에 넣을 문자열. 값이 없는 것과 빈 문자열을 구분한다 */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}
