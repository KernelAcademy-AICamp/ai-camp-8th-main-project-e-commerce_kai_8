// 좁혀 보기(줌·필터). 주소의 검색 파라미터가 유일한 입력이다.
//
// 흐름: 개요(전체) → 날짜로 좁힘 → 세션 하나로 좁힘 → 그 세션의 로그.
// 표의 세션·날짜 칸이 링크라, 눌러 내려가는 것으로 이 흐름이 만들어진다.

/** 지금 화면이 보고 있는 범위 */
export interface DashboardFilter {
  /** 세션 번호 **앞 8자리**. 표에 보이는 것과 같은 형태다 */
  session: string | null;
  /** 한국 시간 기준 날짜 `YYYY-MM-DD` */
  date: string | null;
  /**
   * 최근 며칠만 볼지. `null`이면 전체 기간.
   *
   * **왜 자유 입력이 아니라 허용 목록인가** — `days=99999`는 전체 스캔인데 화면은
   * 좁혀진 것처럼 보인다. 그리고 값마다 다른 질의 계획이 생겨 재보기 어려워진다.
   */
  days: number | null;
  /** 형식이 틀려서 버린 파라미터 이름들. 화면이 이 사실을 알려야 한다 */
  ignored: string[];
}

export const NO_FILTER: DashboardFilter = {
  session: null,
  date: null,
  days: null,
  ignored: [],
};

/** 고를 수 있는 기간. 화면의 버튼과 **같아야 한다** */
export const PERIOD_DAYS = [7, 14, 30] as const;

const SESSION_RE = /^[0-9a-f]{8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function firstValue(raw: string | string[] | undefined): string | null {
  if (raw === undefined) return null;
  // 같은 이름이 여러 번 오면 첫 번째만 쓴다. `.at()`이라야 빈 배열도 안전하다
  const value = (Array.isArray(raw) ? raw : [raw]).at(0);
  return value === undefined || value === "" ? null : value;
}

/** `2026-02-31`처럼 형식은 맞지만 없는 날짜를 거른다 */
function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * 주소에서 온 값을 거른다. **여기가 신뢰 경계다.**
 *
 * 값은 SQL 문장에 글자로 이어붙이지 않는다 — 파라미터로만 넘긴다(설계 §4:
 * "브라우저 입력에서 오는 SQL은 실행하지 않는다"). 그래서 이 검사는 주입 방어가
 * 아니라 **오타·장난 값이 조용히 빈 표로 보이는 것**을 막는 용도다.
 *
 * 형식이 틀리면 버리되 **버렸다는 사실을 남긴다.** 조용히 전체를 보여주면
 * 사용자는 좁혀진 화면을 보고 있다고 착각한다 — 이 대시보드가 가장 경계하는 거짓말이다.
 */
export function parseFilter(
  params: Record<string, string | string[] | undefined>,
): DashboardFilter {
  const ignored: string[] = [];
  const rawSession = firstValue(params.session);
  const rawDate = firstValue(params.date);

  let session: string | null = null;
  if (rawSession !== null) {
    if (SESSION_RE.test(rawSession)) session = rawSession;
    else ignored.push("session");
  }

  let date: string | null = null;
  if (rawDate !== null) {
    if (DATE_RE.test(rawDate) && isRealDate(rawDate)) date = rawDate;
    else ignored.push("date");
  }

  const rawDays = firstValue(params.days);
  let days: number | null = null;
  if (rawDays !== null) {
    const parsed = Number(rawDays);
    // `Number("7; drop table")`은 NaN이라 여기서 걸린다. 그래도 허용 목록이 본 방어다.
    if (PERIOD_DAYS.some((allowed) => allowed === parsed)) days = parsed;
    else ignored.push("days");
  }

  return { session, date, days, ignored };
}

/** 좁혀 보는 중인가 */
export function isNarrowed(filter: DashboardFilter): boolean {
  return filter.session !== null || filter.date !== null || filter.days !== null;
}

/**
 * SQL에 넘길 값. **순서가 `EVENT_FILTER_SQL`의 `$1`·`$2`와 묶여 있다.**
 * 순서를 바꾸면 세션 자리에 날짜가 들어가 조용히 0건이 된다.
 */
export function toParams(filter: DashboardFilter): (string | number | null)[] {
  return [filter.session, filter.date, filter.days];
}

/**
 * 지표 SQL의 `where`에 넣는 조각.
 *
 * **테이블이 둘 이상 보이는 자리에서는 별칭을 넘겨야 한다.** 별칭 없이 쓰면
 * 조인한 두 테이블에 같은 이름의 컬럼이 있을 때 데이터베이스가 어느 쪽인지
 * 정하지 못하고 죽는다. 실제로 「오가며 탐색률」이 `session_id is ambiguous`로
 * 실패했다 — 그 지표만 `c_events`와 유효세션 CTE를 함께 놓고 이 조각을 썼다.
 *
 * **세션은 앞 8자리로 맞춘다.** 표가 8자리만 보여주므로 주소도 8자리라야 짧고,
 * 눌렀을 때 보이던 것과 같은 값이 주소에 남는다.
 * 8자리 앞맞춤이라 이론상 다른 세션과 겹칠 수 있다. 세션이 수만 개가 되면
 * 전체 uuid로 바꾼다 — 그때 고칠 곳은 이 조각과 링크를 내는 SQL뿐이다.
 *
 * **날짜는 범위로 자른다.** 예전에는 `(occurred_at at time zone 'Asia/Seoul')::date = $2`
 * 였는데, 컬럼을 가공하면 `c_events_occurred_idx`를 못 탄다. 실측으로 같은 답에
 * **17.07ms 대 1.71ms** — 10배 차이였다(2026-08-25, 27,950행 기준). 행이 늘수록
 * 이 격차도 같이 커진다. 범위 형태는 색인의 시작점을 바로 찾아간다.
 *
 * 경계는 **시작 이상 · 다음 날 미만**이다. `between`이나 `<=`을 쓰면 자정 정각의
 * 기록이 이틀 모두에 들어간다.
 *
 * **기간도 날짜 경계로 자른다.** `now() - interval 'N days'`로 자르면 첫날이 반쪽만
 * 들어온다 — 지금이 13시면 그날 0~13시 기록이 빠져 일별 막대에서 그 막대만 낮게
 * 보인다. "그날은 한산했다"로 읽히는데 사실이 아니다. 그리고 「최근 7일」인데
 * 달력으로는 8일이 걸린다. 그래서 **오늘을 포함해 N일**이 되도록 `N - 1`을 뺀다.
 *
 * @param alias 컬럼 앞에 붙일 테이블 별칭. 테이블이 하나뿐이면 생략한다.
 */
export function eventFilterSql(alias = ""): string {
  const q = alias === "" ? "" : `${alias}.`;
  return `
      (($1)::text is null or left(${q}session_id::text, 8) = ($1)::text)
      and (($2)::text is null
           or (${q}occurred_at >= (($2)::date + time '00:00') at time zone 'Asia/Seoul'
               and ${q}occurred_at < (($2)::date + 1 + time '00:00') at time zone 'Asia/Seoul'))
      and (($3)::int is null
           or ${q}occurred_at >=
              (((now() at time zone 'Asia/Seoul')::date - (($3)::int - 1))::timestamp
               at time zone 'Asia/Seoul'))`;
}
