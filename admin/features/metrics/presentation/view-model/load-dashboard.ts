// 화면이 그릴 상태를 만든다. View는 이 결과를 표시만 한다.
//
// 서버 컴포넌트에서 도는 코드라 React 훅이 아니다. 그래도 위치는 view-model이다 —
// "무엇을 어떤 순서로 가져와 어떤 상태로 넘기는가"는 표시가 아니라 조립이다
// (frontend/AGENTS.md: View는 로직을 갖지 않는다).

import { METRICS } from "@/metrics";

import { checkConnection, runMetrics } from "../../data/metric-repository";
import { type DashboardState, sortMetrics } from "../../domain/metric";

export async function loadDashboard(): Promise<DashboardState> {
  // 접속을 먼저 확인한다. 안 되는 상태로 카드를 돌리면 전부 실패로 떠서
  // "지표가 다 깨졌다"처럼 보이고 진짜 원인이 가려진다 (설계 §7).
  const connectionError = await checkConnection();
  if (connectionError !== null) {
    return { kind: "connection-failed", message: connectionError };
  }
  return { kind: "loaded", results: await runMetrics(sortMetrics(METRICS)) };
}
