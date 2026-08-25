"use client";

import Link from "next/link";

import type { AuthNotice, AuthUser } from "@/features/auth/domain/auth-session";
import {
  GreetingSkeleton,
  MyPageShell,
  SIDE_BTN,
} from "@/features/auth/presentation/components/my-page-shell";
import { useAuthSession } from "@/features/auth/presentation/view-model/use-auth-session";
import { SettingsMenuButton } from "@/features/settings/presentation/components/settings-menu-button";
import { PersonIcon } from "@/shared/icons";

/** 인사말에 쓸 이름 — 구글 표시 이름을 먼저 쓰고, 없으면 이메일 계정 부분 */
function displayName(user: Pick<AuthUser, "email" | "name">) {
  if (user.name !== null && user.name !== "") return user.name;
  if (user.email == null || user.email === "") return "회원";
  return user.email.split("@")[0];
}

/**
 * 마이페이지 — 계정만 다룬다.
 *
 * 개인정보 안내·데이터 지우기·계정 삭제는 톱니(설정) 안쪽이다. 되돌릴 수 없는
 * 동작을 한 단계 안으로 넣어 실수로 누를 일을 줄인다.
 *
 * **비회원도 들어올 수 있다.** 아래에 설정이 달려 있고 거기에 개인정보 삭제
 * 수단이 있다. 막으면 방침이 약속한 "설정의 초기화 버튼 한 번으로 지워진다"가
 * 깨진다.
 *
 * 계정 아래에 붙는 카드는 **children으로 받는다.** 여기서 직접 import하면
 * feature끼리 얽힌다(frontend/AGENTS.md) — 조립은 라우트가 한다.
 *
 * 틀은 `MyPageShell`이 갖는다. 이동 중 화면(`app/my/loading.tsx`)이 같은 틀을
 * 쓰기 때문이다 — 자세한 이유는 그쪽 주석 참고.
 */
export function MyPage({
  notice,
  children,
}: {
  notice: AuthNotice | null;
  children?: React.ReactNode;
}) {
  const { state, failed } = useAuthSession();

  return (
    <MyPageShell
      settings={<SettingsMenuButton />}
      failure={failed || notice === "failed"}
      greeting={
        <>
          {state.kind === "loading" && <GreetingSkeleton />}
          {state.kind === "signedOut" && "둘러보는 중이에요"}
          {state.kind === "signedIn" && (
            <>
              환영합니다,{" "}
              <b className="font-extrabold text-ink">{displayName(state.user)}</b> 님
            </>
          )}
        </>
      }
      account={
        <>
          {/* 판정 전(loading)에도 비워 둔다 — 대다수인 로그인 상태의 실제
              모습(빈 자리)과 맞춘다. 뼈대를 그렸다가 로그인으로 판명 나면
              그 자리가 사라지며 mr-auto로 밀려 있던 톱니(설정) 위치까지
              같이 튀었다(2026-08-25 버그 수정, `app/my/loading.tsx` 주석
              참고). */}
          {state.kind === "signedOut" && (
            <Link href="/login" aria-label="로그인" className={SIDE_BTN}>
              <PersonIcon size={15} />
            </Link>
          )}
          {/* 로그인 상태에서는 여기 자리가 비어 있다 — 로그아웃은 설정
              화면(`/settings`) 안으로 옮겼다(2026-08-25). */}
        </>
      }
    >
      {children}
    </MyPageShell>
  );
}
