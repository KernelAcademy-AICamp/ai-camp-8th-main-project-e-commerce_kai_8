import { CurationPane } from "@/features/curation/presentation/components/curation-pane";
import { GenderGate } from "@/features/gender/presentation/components/gender-gate";
import { OnboardingGate } from "@/features/onboarding/presentation/components/onboarding-gate";
import { HomeShell } from "@/features/shell/presentation/components/home-shell";

export default function Home() {
  return (
    <main>
      {/* 온보딩을 마치기 전에는 홈을 **마운트하지 않는다** — 가리기만 하면 큐레이션
          칸이 앵커 제목을 조회하고 피드 훅이 첫 페이지를 부른다.
          성별 게이트는 안쪽에 남긴다 — 개인화 초기화 직후처럼 기기 성별이 잠시
          비는 사이에 피드가 성별 없이 요청하는 것을 막는다. */}
      <OnboardingGate>
        <GenderGate>
          <HomeShell forYou={<CurationPane />} />
        </GenderGate>
      </OnboardingGate>
    </main>
  );
}
