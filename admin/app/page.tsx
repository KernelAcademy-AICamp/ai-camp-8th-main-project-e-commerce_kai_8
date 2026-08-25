import { parseFilter } from "@/features/metrics/domain/filters";
import { parseScreen } from "@/features/metrics/domain/metric";
import { parseFlowView } from "@/features/metrics/domain/session-flow";
import { Dashboard } from "@/features/metrics/presentation/components/dashboard";

/**
 * 열 때마다 다시 계산한다.
 *
 * 이게 없으면 Next.js가 빌드 시점에 한 번 구워 고정한다 — 배포한 순간의 숫자가
 * 영원히 걸려 있게 되고, 게다가 빌드 서버가 데이터베이스에 붙어야 한다.
 * 대시보드는 **지금 값**을 보는 도구다.
 */
export const dynamic = "force-dynamic";

/**
 * 좁혀 보기는 **주소에만** 있다 — `?date=2026-08-23&session=711ce185`.
 *
 * 화면에 상태를 두지 않아서 좋은 점: 주소를 그대로 복사해 넘기면 같은 화면이
 * 열린다. 서버 컴포넌트라 브라우저에서 다시 계산하는 부분도 없다.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const screen = params.screen;
  const flow = params.flow;
  return (
    <Dashboard
      filter={parseFilter(params)}
      screen={parseScreen(typeof screen === "string" ? screen : undefined)}
      // 세션 흐름도의 좁혀 보기. **SQL은 안 바꾼다** — 다섯 갈래를 다 가져와
      // 그리는 쪽에서 합치므로 질의는 한 번만 돈다. 그래서 `filter`가 아니다.
      flow={parseFlowView(typeof flow === "string" ? flow : undefined)}
    />
  );
}
