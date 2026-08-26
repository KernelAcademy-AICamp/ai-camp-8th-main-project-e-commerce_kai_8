// 대시보드에 올릴 지표 명단.
//
// ── 새 지표를 추가하는 방법 ──────────────────────────────────────────────
//   1. 이 폴더에 파일을 하나 만든다 (event-volume.ts를 본뜨면 된다)
//   2. 아래 import와 METRICS 배열에 한 줄씩 추가한다
//   화면 코드는 건드리지 않는다. 컬럼 이름이 그대로 표 머리글이 된다.
//
// ⚠️ SQL은 **읽기 전용**이어야 한다. 데이터베이스 계정이 쓰기를 거부하지만
//    (설계 §2-2), 거부는 카드 하나가 조용히 "실패"로 뜨는 것으로 나타날 뿐이다.
//    index.test.ts가 쓰기 키워드를 미리 잡아 이름을 대며 실패시킨다.

import type { MetricDefinition } from "@/features/metrics/domain/metric";

import { activeDays } from "./active-days";
import { bucketConversion } from "./bucket-conversion";
import { dailyVolume } from "./daily-volume";
import { eventVolume } from "./event-volume";
import { onboardingFunnel } from "./onboarding-funnel";
import { rawEvents } from "./raw-events";
import { returnCurve } from "./return-curve";
import { sessionFunnel } from "./session-funnel";
import { sessionList } from "./session-list";
import { sessionSummary } from "./session-summary";
import { tasteFunnel } from "./taste-funnel";
import { tasteOscillation } from "./taste-oscillation";
import { tasteRefreshOutcome } from "./taste-refresh-outcome";
import { tasteViewBlocked } from "./taste-view-blocked";

export const METRICS: readonly MetricDefinition[] = [
  eventVolume,
  dailyVolume,
  onboardingFunnel,
  sessionSummary,
  sessionFunnel,
  sessionList,
  bucketConversion,
  tasteOscillation,
  tasteFunnel,
  tasteViewBlocked,
  tasteRefreshOutcome,
  returnCurve,
  activeDays,
  rawEvents,
];
