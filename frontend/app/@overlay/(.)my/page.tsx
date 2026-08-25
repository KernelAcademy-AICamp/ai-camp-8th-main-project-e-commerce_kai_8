import { GuestLoginPopup } from "@/features/auth/presentation/components/guest-login-popup";
import { MyPage } from "@/features/auth/presentation/components/my-page";
import { ProfileActivityCard } from "@/features/feed/presentation/components/profile-activity-card";
import { TasteCard } from "@/features/taste/presentation/components/taste-card";
import { OverlaySlotGuard } from "@/shared/history/overlay-slot-guard";

/**
 * 홈에서 프로필을 열었을 때 — **홈 위에 겹쳐** 그린다.
 *
 * 주소는 그대로 `/my`다. 앱 안에서 넘어올 때만 이 자리가 쓰이고, 주소를 직접 치거나
 * 새로고침하면 `app/my/page.tsx`(단독 화면)가 대신 그려진다. 그래서 주소·뒤로가기·
 * 공유는 그대로 살아 있다.
 *
 * 새 화면이 이전 화면을 **완전히 덮는다** — 뒤의 홈은 줄어들거나 움직이지 않는다
 * (2026-08-25 push 스택 전환, 그 전엔 살짝 줄어드는 사이드시트였다). 프로필 위에
 * 설정을 더 열 때도 같은 방식으로 쌓인다 — 루트 레이아웃의 `settingsOverlay` 자리.
 *
 * 서버를 기다리지 않는다. `?auth=` 안내는 구글 로그인 콜백(`app/auth/callback/route.ts`)이
 * 서버에서 `/my`로 리다이렉트할 때만 붙는 하드 내비게이션이라 이 인터셉트 오버레이를
 * 아예 거치지 않는다 — 항상 `app/my/page.tsx`(단독 화면)가 그 안내를 받는다. 그래서
 * 여기는 항상 `notice={null}`이다(`app/@settingsOverlay/(.)settings/page.tsx`와 같은 이유).
 *
 * `OverlaySlotGuard`로 감싼다(2026-08-25) — 설정 화면에서 `/privacy`처럼 이
 * 슬롯도 `@settingsOverlay`도 모르는 주소로 옮기면, 슬롯이 자동으로 비지
 * 않고 이 화면을 그대로 들고 있어 뒤에 새로 그려진 화면을 가린다. 자세한
 * 이유는 그 컴포넌트 주석 참고.
 */
export default function ProfileOverlay() {
  return (
    <OverlaySlotGuard expectedPath="/my">
      <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain">
        <MyPage notice={null}>
          <TasteCard />
          <ProfileActivityCard />
        </MyPage>
        {/* 비회원 안내는 판 바깥 — 판이 밀려 들어오는 동안의 변형에 끌려가지 않게 */}
        <GuestLoginPopup />
      </div>
    </OverlaySlotGuard>
  );
}
