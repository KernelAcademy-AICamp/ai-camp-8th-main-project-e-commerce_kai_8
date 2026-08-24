import { FolderGridView } from "@/features/feed/wishlist/presentation/components/folder-grid-view";
import { OnboardingGate } from "@/features/onboarding/presentation/components/onboarding-gate";

export default function WishlistPage() {
  return (
    <main>
      {/* 보관함도 온보딩 뒤에 열린다 — 직접 URL로 게이트를 우회할 수 있으면 게이트가
          아니다(O-41). 설정·처리방침·마이 페이지는 **일부러 열어 둔다** — 삭제와
          고지에 닿는 길을 막으면 안 된다(로그인 화면 설계 2026-08-19). */}
      <OnboardingGate>
        <FolderGridView />
      </OnboardingGate>
    </main>
  );
}
