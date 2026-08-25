// 지표 카드의 형태와 순수 규칙. 프레임워크·DB에 의존하지 않는다.
// 설계: docs/superpowers/specs/2026-08-20-admin-event-dashboard-design.md §4

/**
 * 대시보드 카드 하나의 정의. `admin/metrics/`의 파일들이 이 모양을 따른다.
 *
 * 새 지표를 넣는 방법 = 이 모양의 파일을 하나 만들고 `metrics/index.ts` 명단에
 * 추가하는 것. 화면 코드는 건드리지 않는다.
 */
/**
 * 대시보드 화면. 주소의 `?screen=`으로 고른다.
 *
 * 분석 종류를 축으로 나눴다 — 카드를 만든 순서가 아니라 **무엇을 묻는가**로
 * 묶어야 찾는 사람이 어디를 볼지 안다.
 */
export const SCREENS = [
  { name: "overview", label: "개요" },
  { name: "retention", label: "리텐션" },
  { name: "recommendation", label: "추천" },
  { name: "raw", label: "원본" },
] as const;

export type ScreenName = (typeof SCREENS)[number]["name"];

/** 주소에서 온 값을 화면 이름으로 읽는다. 모르는 값이면 개요다 — 오타로 빈 화면이 뜨면 안 된다 */
export function parseScreen(raw: string | undefined): ScreenName {
  return SCREENS.some((s) => s.name === raw) ? (raw as ScreenName) : "overview";
}

/** 그 화면에 속한 지표만, 정해진 순서로 */
export function metricsForScreen(
  definitions: readonly MetricDefinition[],
  screen: ScreenName,
): MetricDefinition[] {
  return sortMetrics(definitions.filter((d) => (d.screen ?? "overview") === screen));
}

/**
 * 그림의 종류. 카드마다 필요한 그림이 달라 **범용 차트를 만들지 않는다** —
 * 「세션 흐름도」는 세션 퍼널 하나만을 위한 그림이고, 다른 데 쓰지 않는다.
 * 범용으로 만들면 설정 칸이 늘어나 SQL이 아니라 설정이 정본이 된다.
 */
export type ChartKind =
  "kpi-strip" | "daily-bars" | "funnel-band" | "boxplot" | "session-flow";

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
   * 이 지표가 속한 화면. 생략하면 개요다.
   *
   * 화면을 나누면 **그 화면의 질의만 돈다.** 한 페이지에 다 두면 열 때마다
   * 아홉 개가 전부 데이터베이스에 나간다.
   */
  screen?: ScreenName;
  /**
   * 표 대신 **그림으로** 그린다. 생략하면 지금처럼 표다.
   *
   * **여기 있는 것은 「어떻게 그릴지」뿐이다.** 무엇을 그릴지는 여전히 SQL이 정한다 —
   * 그리는 쪽은 결과 표(`MetricTable`)를 읽어 그린다. 그래서 새 지표를 넣는 방법은
   * 지금과 같다: 파일 하나 만들고 명단에 한 줄. 화면 코드는 안 건드린다.
   *
   * 그림이 붙어도 **표는 사라지지 않는다.** 카드 아래 접어 둔다 — 마크에 `tabindex`를
   * 붙이지 않으므로 그 표가 키보드로 값을 읽는 유일한 경로다.
   */
  chart?: ChartKind;
  /**
   * true면 카드를 **접힌 채로** 그린다. 제목과 설명만 보이고 표는 눌러야 펼쳐진다.
   * 대조용 낱개 기록처럼 평소엔 접어 두고 필요할 때만 여는 표에 쓴다.
   */
  collapsed?: boolean;
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
  /** 화면에 찍을 글자. `1457` → `"1,457"` */
  rows: string[][];
  /**
   * 같은 자리의 **원본 숫자**. 숫자가 아닌 칸은 `null`.
   *
   * 차트는 길이와 좌표를 계산해야 하므로 숫자가 필요하다. `rows`의 글자를 되돌려
   * 읽는 방식은 쓰지 않는다 — 쉼표·단위·로케일이 섞이면 조용히 틀린다.
   * `rows`와 **같은 모양**이라 `values[r][c]`가 `rows[r][c]`의 숫자다.
   */
  values: (number | null)[][];
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
 * 조회로 시작하는가.
 *
 * `with`(CTE)도 허용한다 — 세션 단위 집계처럼 중간 결과가 필요한 지표는 `with`로
 * 시작한다. `with` 안에 쓰기를 숨길 수는 있지만(data-modifying CTE) 그것은
 * `findWriteKeywords`가 잡는다. 두 검사는 서로를 대신하지 않는다.
 */
export function isReadOnlyStart(sql: string): boolean {
  const head = sql.trim().toLowerCase();
  return head.startsWith("select") || head.startsWith("with");
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
    values: rows.map((row) => columns.map((column) => toNumber(row[column]))),
  };
}

/**
 * 차트가 쓸 숫자. 숫자가 아니면 `null`.
 *
 * **데이터베이스가 글자로 주는 숫자를 받아야 한다.** `pg`는 `bigint`와 `numeric`을
 * 정밀도 손실을 피하려고 문자열로 준다 — `count(*)`도 `"260"`으로 온다. 그대로 두면
 * 차트가 못 그린다.
 *
 * 반대로 **숫자로 보이지 않는 글자는 숫자로 읽지 않는다.** `Number("2026-08-25")`는
 * `NaN`이라 괜찮지만, `Number("")`는 `0`이고 `Number("4e3")`은 `4000`이다.
 * 빈 칸이 0으로 세어지거나 세션 번호가 지수로 읽히면 그림이 조용히 틀린다.
 * 그래서 **모양을 먼저 확인**한다.
 */
const NUMERIC = /^-?\d+(\.\d+)?$/;

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && NUMERIC.test(value.trim())) return Number(value);
  return null;
}

/**
 * 셀이 주소면 링크로 보여줄 정보, 아니면 null.
 *
 * 지표 SQL이 주소를 그대로 컬럼으로 내면 표가 링크로 그린다. 이렇게 하면
 * **새 카드에 링크를 붙일 때 화면 코드를 고치지 않아도 된다** — 설계 §4가
 * "컬럼 이름을 그대로 표 머리글로 쓴다"로 얻은 것과 같은 성질이다.
 *
 * 보이는 글자는 주소의 **마지막 조각**이다. 긴 주소를 그대로 깔면 표가 옆으로
 * 밀려 다른 칸이 안 보인다.
 *
 * 두 종류를 구분한다 — 밖으로 나가는 주소(`https://`)는 새 탭, 같은 화면을 좁혀
 * 보는 주소(`?session=...`)는 같은 탭이다. 좁혀 보기가 새 탭으로 열리면 파고들다
 * 탭이 쌓이고, 돌아가기 버튼으로 개요에 못 돌아온다.
 */
export function asLink(cell: string): MetricLink | null {
  if (/^https?:\/\/\S+$/.test(cell)) {
    return {
      href: cell,
      label: cell.split("/").filter(Boolean).at(-1) ?? cell,
      external: true,
    };
  }
  // 같은 화면을 좁혀 보는 링크(`?session=...`). 보이는 글자는 = 뒤의 값이라
  // 표에는 필터를 걸기 전과 똑같은 글자가 남는다.
  if (/^\?[a-z]+=[\w-]+$/.test(cell)) {
    return { href: cell, label: cell.slice(cell.indexOf("=") + 1), external: false };
  }
  return null;
}

/** 누를 수 있는 셀 */
export interface MetricLink {
  href: string;
  label: string;
  /** true면 밖으로 나가는 주소 — 새 탭에서 연다 */
  external: boolean;
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
