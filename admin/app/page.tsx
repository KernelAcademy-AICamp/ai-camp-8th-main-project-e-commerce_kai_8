import { Dashboard } from "@/features/metrics/presentation/components/dashboard";

/**
 * 열 때마다 다시 계산한다.
 *
 * 이게 없으면 Next.js가 빌드 시점에 한 번 구워 고정한다 — 배포한 순간의 숫자가
 * 영원히 걸려 있게 되고, 게다가 빌드 서버가 데이터베이스에 붙어야 한다.
 * 대시보드는 **지금 값**을 보는 도구다.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  return <Dashboard />;
}
