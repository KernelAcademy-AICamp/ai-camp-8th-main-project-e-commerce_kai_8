import type { Metadata } from "next";

import { readAuthNotice } from "@/features/auth/domain/auth-session";
import { GuestLoginPopup } from "@/features/auth/presentation/components/guest-login-popup";
import { MyPage } from "@/features/auth/presentation/components/my-page";
import { ProfileActivityCard } from "@/features/feed/presentation/components/profile-activity-card";
import { TasteCard } from "@/features/taste/presentation/components/taste-card";

export const metadata: Metadata = {
  title: "마이페이지 · aTee",
};

export default async function MyPageRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = params.auth;
  return (
    <>
      <MyPage notice={readAuthNotice(typeof auth === "string" ? auth : null)}>
        <TasteCard />
        <ProfileActivityCard />
      </MyPage>
      {/* 비회원 안내는 판 **바깥**에 둔다 — 판은 열릴 때 밀려 들어오느라 잠시
          변형이 걸리는데, 그 안에 있으면 창이 화면이 아니라 판을 기준으로 잡힌다 */}
      <GuestLoginPopup />
    </>
  );
}
