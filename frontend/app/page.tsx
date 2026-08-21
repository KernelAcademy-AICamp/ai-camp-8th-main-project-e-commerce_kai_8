import { CurationPane } from "@/features/curation/presentation/components/curation-pane";
import { GenderGate } from "@/features/gender/presentation/components/gender-gate";
import { HomeShell } from "@/features/shell/presentation/components/home-shell";

export default function Home() {
  return (
    <main>
      {/* 성별을 고르기 전에는 홈을 **마운트하지 않는다** — 가리기만 하면 큐레이션 칸이
          앵커 제목을 조회하고 피드 훅이 첫 페이지를 부른다 (계획 2단계). */}
      <GenderGate>
        <HomeShell forYou={<CurationPane />} />
      </GenderGate>
    </main>
  );
}
