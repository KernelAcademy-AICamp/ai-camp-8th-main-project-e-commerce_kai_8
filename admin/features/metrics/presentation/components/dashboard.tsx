import Link from "next/link";

import {
  type DashboardFilter,
  isNarrowed,
  NO_FILTER,
  PERIOD_DAYS,
} from "../../domain/filters";
import { cardSpan, type ScreenName, SCREENS, spanClass } from "../../domain/metric";
import type { FlowView } from "../../domain/session-flow";
import { loadDashboard } from "../view-model/load-dashboard";
import { type ChartContext, MetricCard } from "./metric-card";

/** 대시보드 화면. 상태를 만드는 일은 view-model이 하고 여기는 표시만 한다 */
export async function Dashboard({
  filter = NO_FILTER,
  screen = "overview",
  flow = "all",
}: {
  filter?: DashboardFilter;
  screen?: ScreenName;
  flow?: FlowView;
}) {
  const state = await loadDashboard(filter, screen);
  const chartContext: ChartContext = {
    // 세션으로 좁힌 것은 시간 창이 아니다 — 그 세션 하나만 남아 누적 문제가 그대로다.
    windowed: filter.days !== null || filter.date !== null,
    flow,
    flowHref: (view) => queryHref({ screen, filter, flow: view }),
  };
  return (
    <main className="mx-auto max-w-[1120px] px-5 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-neutral-100">aTee 이벤트 대시보드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          화면을 열 때마다 데이터베이스에서 다시 계산합니다.
        </p>
      </header>

      <ScreenTabs current={screen} filter={filter} />

      <PeriodPicker filter={filter} screen={screen} />

      <FilterBar filter={filter} />

      {state.kind === "connection-failed" ? (
        <ConnectionFailed message={state.message} />
      ) : (
        // 12칸 격자. 너비는 **카드가 정한다**(`span`) — 얼마나 넓어야 읽히는지는
        // 그림이 안다. 좁은 화면(lg 미만)에서는 전부 통칸이 된다.
        <div className="grid grid-cols-12 items-start gap-5">
          {state.results.map((result) => (
            <div
              key={result.definition.id}
              className={spanClass(cardSpan(result.definition))}
            >
              <MetricCard result={result} chartContext={chartContext} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

/**
 * 화면 탭. **링크다** — 서버 컴포넌트라 자바스크립트 없이 동작하고, 주소를
 * 복사해 넘기면 같은 화면이 열린다.
 *
 * 좁혀 보기 값을 탭 링크에 그대로 실어 옮긴다. 안 실으면 탭을 누르는 순간
 * 날짜·세션 좁혀 보기가 조용히 풀린다.
 */
function ScreenTabs({
  current,
  filter,
}: {
  current: ScreenName;
  filter: DashboardFilter;
}) {
  const hrefFor = (next: ScreenName): string => queryHref({ screen: next, filter });
  return (
    <nav className="mb-6 flex gap-1 border-b border-neutral-800" aria-label="화면">
      {SCREENS.map((screen) => {
        const on = screen.name === current;
        return (
          <Link
            key={screen.name}
            href={hrefFor(screen.name)}
            aria-current={on ? "page" : undefined}
            className={
              on
                ? "border-b-2 border-sky-500 px-4 py-2 text-sm font-medium text-neutral-100"
                : "border-b-2 border-transparent px-4 py-2 text-sm text-neutral-500 hover:text-neutral-300"
            }
          >
            {screen.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * 기간 선택기. **링크다** — 탭과 같은 이유로 버튼이 아니라 링크로 둔다.
 *
 * **왜 필요한가** — 전체 기간만 보면 두 가지가 동시에 망가진다.
 *
 * ① **그림이 못 읽게 된다.** 일별 막대는 63일째에 막대 폭이 0이 되고, 날짜
 *    이름표는 16일째부터 겹친다(2026-08-25 계산).
 * ② **변화가 뭉개진다.** 세션 요약과 퍼널이 전체 기간 평균이라, 이번 주에
 *    좋아져도 지난 두 달 평균에 묻혀 안 움직인다.
 *
 * 그리고 빨라진다. `occurred_at` 색인이 생긴 뒤 실측으로 세션 요약 43ms →
 * 11ms, 퍼널 16ms → 5ms였다(하루로 좁혔을 때).
 *
 * **날짜 하나를 고른 상태에서는 숨긴다.** 「최근 7일」과 「8월 24일」을 동시에
 * 걸면 교집합이 되는데, 화면만 보고는 어느 쪽이 이겼는지 알 수 없다.
 * 좁혀 보기는 한 번에 한 방향이라야 읽힌다.
 */
function PeriodPicker({
  filter,
  screen,
}: {
  filter: DashboardFilter;
  screen: ScreenName;
}) {
  if (filter.date !== null) return null;

  const hrefFor = (days: number | null): string =>
    queryHref({ screen, filter: { ...filter, days } });

  const options: { days: number | null; label: string }[] = [
    ...PERIOD_DAYS.map((days) => ({ days, label: `최근 ${days}일` })),
    { days: null, label: "전체" },
  ];

  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="기간"
    >
      <span className="text-xs text-neutral-500">기간</span>
      {options.map((option) => {
        const on = filter.days === option.days;
        return (
          <Link
            key={option.label}
            href={hrefFor(option.days)}
            aria-current={on ? "true" : undefined}
            // 최소 44x44 CSS px. WCAG 2.2 AA(24px)는 넘지만 AAA·Apple HIG는 44를 권한다.
            className={
              (on
                ? "bg-sky-600 font-medium text-white "
                : "border border-neutral-800 text-neutral-400 hover:text-neutral-200 ") +
              "flex min-h-11 items-center rounded-md px-4 text-[13px]"
            }
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * 지금 보고 있는 것을 주소로 만든다.
 *
 * **한 곳에 모아 둔다.** 탭·기간·흐름도가 각자 주소를 만들면, 어느 하나가 다른 값을
 * 안 실어 옮겨서 누를 때마다 조용히 필터가 풀린다. 실제로 탭이 기간을 잃은 적이 있다.
 */
function queryHref({
  screen,
  filter,
  flow,
}: {
  screen: ScreenName;
  filter: DashboardFilter;
  flow?: FlowView;
}): string {
  const params = new URLSearchParams();
  if (screen !== "overview") params.set("screen", screen);
  if (filter.session !== null) params.set("session", filter.session);
  if (filter.date !== null) params.set("date", filter.date);
  if (filter.days !== null) params.set("days", String(filter.days));
  if (flow !== undefined && flow !== "all") params.set("flow", flow);
  const query = params.toString();
  return query === "" ? "/" : `/?${query}`;
}

/**
 * 접속 실패는 화면 전체에 알린다.
 *
 * 이걸 카드별 실패와 같게 다루면, 모든 카드가 나란히 "실패"로 떠서 지표가 깨진
 * 것처럼 보인다. 원인은 하나인데 증상이 여섯 개로 보이면 진단이 늦어진다.
 */
function ConnectionFailed({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-800 bg-red-950/60 p-6">
      <h2 className="text-base font-semibold text-red-200">
        데이터베이스에 연결하지 못했습니다
      </h2>
      <p className="mt-2 text-sm text-red-300">
        아래 숫자들은 <strong>0이 아니라 &ldquo;알 수 없음&rdquo;</strong>입니다. 접속
        정보(<code className="font-mono">ADMIN_DATABASE_URL</code>)를 확인하세요.
      </p>
      <p className="mt-3 font-mono text-xs break-all text-red-400">{message}</p>
    </div>
  );
}

/**
 * 지금 무엇으로 좁혀 보고 있는지.
 *
 * **좁혀진 화면인데 그렇게 안 보이는 것이 이 도구의 가장 위험한 거짓말이다.**
 * 하루치만 보면서 전체라고 착각하면 모든 판단이 틀어진다. 그래서 좁혀 보는 중일
 * 때는 띠가 눈에 띄게 뜨고, 되돌아가는 링크가 항상 붙는다.
 */
function FilterBar({ filter }: { filter: DashboardFilter }) {
  if (!isNarrowed(filter) && filter.ignored.length === 0) return null;
  return (
    <div className="mb-6 rounded-lg border border-amber-800 bg-amber-950/40 p-4">
      {isNarrowed(filter) && (
        <p className="text-sm text-amber-200">
          <strong>좁혀 보는 중</strong>
          {filter.days !== null && <> · 최근 {filter.days}일</>}
          {filter.date !== null && <> · 날짜 {filter.date}</>}
          {filter.session !== null && <> · 세션 {filter.session}</>}
          <Link
            href="/"
            className="ml-3 underline underline-offset-2 hover:text-amber-100"
          >
            전체로 돌아가기
          </Link>
        </p>
      )}
      {filter.ignored.length > 0 && (
        <p className="mt-1 text-sm text-red-300">
          형식이 맞지 않아 <strong>무시한 조건</strong>: {filter.ignored.join(", ")} —
          이 조건은 걸리지 않았습니다.
        </p>
      )}
      <p className="mt-2 text-xs text-amber-400/80">
        맨 위 &ldquo;이벤트 유입&rdquo; 카드만 항상 전체 기준입니다 — 데이터가 지금도
        들어오는지 보는 카드라 좁히면 뜻을 잃습니다.
      </p>
    </div>
  );
}
