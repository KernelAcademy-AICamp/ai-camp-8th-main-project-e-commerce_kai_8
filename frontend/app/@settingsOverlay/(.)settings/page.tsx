import { AccountDeleteSection } from "@/features/auth/presentation/components/account-delete-section";
import { LogoutSection } from "@/features/auth/presentation/components/logout-section";
import { AppVersionLine } from "@/features/settings/presentation/components/app-version-line";
import { GenderSettings } from "@/features/settings/presentation/components/gender-settings";
import { PrivacySettings } from "@/features/settings/presentation/components/privacy-settings";
import { SettingsHeader } from "@/features/settings/presentation/components/settings-header";
import { OverlaySlotGuard } from "@/shared/history/overlay-slot-guard";

/**
 * 프로필 위에서 설정을 열었을 때 — **프로필 위에 겹쳐** 그린다.
 *
 * 주소는 그대로 `/settings`다. 프로필 안에서 넘어올 때만 이 자리가 쓰이고,
 * 주소를 직접 치거나 새로고침하면 `app/settings/page.tsx`(단독 화면)가 대신
 * 그려진다. 닫기는 `SettingsHeader`의 뒤로가기 화살표가 맡는다 — 쌓인 상태면
 * 한 단계만 뒤로(설정 → 프로필), 아니면 `/my`로 보낸다(`useBackTo`, 손대지 않음).
 *
 * 이 앱에서 `/settings`로 가는 길은 프로필 화면의 톱니 버튼뿐이다(2026-08-25 —
 * 예전엔 톱니를 누르면 시트가 펼쳐졌고, 그 안의 "회원 탈퇴"만 이 화면으로 왔다)
 * — 그래서 이 자리가 루트 레이아웃의 슬롯이라 "항상 존재"해도 실제로는 프로필을
 * 거칠 때만 채워진다.
 *
 * 서버를 기다리지 않는다. 계정 삭제 알림(`?auth=`)은 `window.location.replace`로
 * 붙는 하드 내비게이션이라 이 인터셉트 오버레이를 아예 거치지 않는다 — 항상
 * `app/settings/page.tsx`(단독 화면)가 그 알림을 받는다. 그래서 여기는 항상
 * `notice={null}`이다.
 *
 * `OverlaySlotGuard`로 감싼다(2026-08-25 버그 수정) — 안의 `PrivacySettings`가
 * 여는 `/privacy`처럼 이 슬롯도 `@overlay`도 모르는 주소로 옮기면, 슬롯이
 * 자동으로 비지 않고 이 화면을 그대로 들고 있어(z-50, `fixed inset-0`) 뒤에
 * 새로 그려진 화면이 안 보였다 — 주소는 바뀌는데 화면은 그대로인 버그였다.
 * 자세한 이유는 그 컴포넌트 주석 참고.
 */
export default function SettingsOverlay() {
  return (
    <OverlaySlotGuard expectedPath="/settings">
      <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
        <main className="push-in relative min-h-dvh w-full bg-app text-ink">
          <div className="mx-auto max-w-md px-4 pb-6">
            <SettingsHeader />
            <GenderSettings />
            <PrivacySettings />
            <LogoutSection />
            <AccountDeleteSection notice={null} />
            <AppVersionLine />
          </div>
        </main>
      </div>
    </OverlaySlotGuard>
  );
}
