import { AccountDeleteSection } from "@/features/auth/presentation/components/account-delete-section";
import { AppVersionLine } from "@/features/settings/presentation/components/app-version-line";
import { GenderSettings } from "@/features/settings/presentation/components/gender-settings";
import { PrivacySettings } from "@/features/settings/presentation/components/privacy-settings";
import { SettingsHeader } from "@/features/settings/presentation/components/settings-header";

/**
 * 프로필 위에서 설정을 열었을 때 — **프로필 위에 겹쳐** 그린다.
 *
 * 주소는 그대로 `/settings`다. 프로필 안에서 넘어올 때만 이 자리가 쓰이고,
 * 주소를 직접 치거나 새로고침하면 `app/settings/page.tsx`(단독 화면)가 대신
 * 그려진다. 닫기는 `SettingsHeader`의 뒤로가기 화살표가 맡는다 — 쌓인 상태면
 * 한 단계만 뒤로(설정 → 프로필), 아니면 `/my`로 보낸다(`useBackTo`, 손대지 않음).
 *
 * 이 앱에서 `/settings`로 가는 링크는 프로필 화면(설정 메뉴)의 "회원 탈퇴" 하나뿐이다
 * — 그래서 이 자리가 루트 레이아웃의 슬롯이라 "항상 존재"해도 실제로는 프로필을
 * 거칠 때만 채워진다.
 *
 * 서버를 기다리지 않는다. 계정 삭제 알림(`?auth=`)은 로그인에서 돌아올 때만
 * 붙는데 그것은 주소로 들어오는 경로라 단독 화면이 맡는다 — 여기는 항상
 * `notice={null}`이다(`app/@overlay/(.)my/page.tsx`와 같은 이유).
 */
export default function SettingsOverlay() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
      <main className="push-in relative min-h-dvh w-full bg-app text-ink shadow-[-12px_0_28px_rgb(20_26_40/0.25)]">
        <div className="mx-auto max-w-md px-4 pb-6">
          <SettingsHeader />
          <GenderSettings />
          <PrivacySettings />
          <AccountDeleteSection notice={null} />
          <AppVersionLine />
        </div>
      </main>
    </div>
  );
}
