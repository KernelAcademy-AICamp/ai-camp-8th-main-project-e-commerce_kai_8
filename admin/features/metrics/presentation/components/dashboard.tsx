import Link from "next/link";

import { type DashboardFilter, isNarrowed, NO_FILTER } from "../../domain/filters";
import { type ScreenName, SCREENS } from "../../domain/metric";
import { loadDashboard } from "../view-model/load-dashboard";
import { MetricCard } from "./metric-card";

/** 대시보드 화면. 상태를 만드는 일은 view-model이 하고 여기는 표시만 한다 */
export async function Dashboard({
  filter = NO_FILTER,
  screen = "overview",
}: {
  filter?: DashboardFilter;
  screen?: ScreenName;
}) {
  const state = await loadDashboard(filter, screen);
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-neutral-100">aTee 이벤트 대시보드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          화면을 열 때마다 데이터베이스에서 다시 계산합니다.
        </p>
      </header>

      <ScreenTabs current={screen} filter={filter} />

      <FilterBar filter={filter} />

      {state.kind === "connection-failed" ? (
        <ConnectionFailed message={state.message} />
      ) : (
        <div className="flex flex-col gap-5">
          {state.results.map((result) => (
            <MetricCard key={result.definition.id} result={result} />
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
  function hrefFor(screen: ScreenName): string {
    const params = new URLSearchParams();
    if (screen !== "overview") params.set("screen", screen);
    if (filter.date !== null) params.set("date", filter.date);
    if (filter.session !== null) params.set("session", filter.session);
    const query = params.toString();
    return query === "" ? "/" : `/?${query}`;
  }
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
