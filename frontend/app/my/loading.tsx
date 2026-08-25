import {
  GreetingSkeleton,
  MyPageShell,
} from "@/features/auth/presentation/components/my-page-shell";
import { ProfileActivityCardSkeleton } from "@/features/feed/presentation/components/profile-activity-card-skeleton";
import { SettingsMenuButton } from "@/features/settings/presentation/components/settings-menu-button";
import { TasteCardSkeleton } from "@/features/taste/presentation/components/taste-card-skeleton";

/**
 * 마이페이지로 **이동하는 동안** 보이는 화면.
 *
 * 이 경로는 미리 만들어 둘 수 없어(주소의 `?auth=` 값을 서버가 읽는다) 누를
 * 때마다 서버 응답을 기다린다. 이 파일이 없으면 그동안 **이전 화면에 그대로
 * 머문다** — 버튼이 죽은 것처럼 보이는 직접 원인이다.
 *
 * 기다림 자체를 줄이는 일은 따로다:
 * `docs/plans/2026-08-20-my-page-navigation-latency.md`
 *
 * 안쪽은 **도착 직후의 첫 그림과 글자 하나까지 같아야 한다.** 응답이 와도 로그인
 * 판정은 아직 안 끝나 있어 어차피 같은 뼈대가 이어지는데, 여기서 다르게 그리면
 * 뼈대 → 다른 뼈대 → 완성으로 두 번 튄다. 같음은 `loading.test.tsx`가 지킨다.
 *
 * 취향 카드를 여기서 조립하는 것도 `app/my/page.tsx`와 같은 이유다 — 화면끼리
 * import하지 않고 라우트가 조립한다(frontend/AGENTS.md).
 *
 * **계정 자리(`account`)는 비워 둔다.** 로그인 상태에서는 그 자리가 원래
 * 빈다(로그아웃은 설정 화면 안으로 옮겼다) — 대다수가 이미 로그인한 채
 * 마이페이지로 돌아오는 경우라, 빈 자리를 기준으로 맞춘다. 예전에 여기
 * 뼈대(원 30px)를 그렸다가, 로그인 상태로 판명나 그 자리가 사라지는 순간
 * `mr-auto`로 오른쪽에 붙어 있던 톱니(설정) 버튼까지 같이 밀려 위치가
 * 튀었다(2026-08-25 버그 수정) — 톱니가 계정 자리 바로 앞이라 계정 자리
 * 너비가 통째로 톱니 위치에 영향을 준다.
 */
export default function MyLoading() {
  return (
    <MyPageShell
      greeting={<GreetingSkeleton />}
      settings={<SettingsMenuButton />}
      account={null}
    >
      <TasteCardSkeleton />
      <ProfileActivityCardSkeleton />
    </MyPageShell>
  );
}
