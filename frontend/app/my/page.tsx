import type { Metadata } from "next";

import { readAuthNotice } from "@/features/auth/domain/auth-session";
import { AfterLoginReturn } from "@/features/auth/presentation/components/after-login-return";
import { MyPage } from "@/features/auth/presentation/components/my-page";
import { RecentStrip } from "@/features/feed/presentation/components/recent-strip";
import { ProfileStats } from "@/features/feed/wishlist/presentation/components/profile-stats";
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
    <MyPage notice={readAuthNotice(typeof auth === "string" ? auth : null)}>
      <AfterLoginReturn />
      <TasteCard />
      <RecentStrip />
      <ProfileStats />
    </MyPage>
  );
}
