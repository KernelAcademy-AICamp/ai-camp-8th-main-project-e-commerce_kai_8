import { loadDashboard } from "../view-model/load-dashboard";
import { MetricCard } from "./metric-card";

/** 대시보드 화면. 상태를 만드는 일은 view-model이 하고 여기는 표시만 한다 */
export async function Dashboard() {
  const state = await loadDashboard();
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-neutral-100">aTee 이벤트 대시보드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          화면을 열 때마다 데이터베이스에서 다시 계산합니다.
        </p>
      </header>

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
