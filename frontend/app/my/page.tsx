import type { Metadata } from "next";

import { readAuthNotice } from "@/features/auth/domain/auth-session";
import { MyPage } from "@/features/auth/presentation/components/my-page";
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
      <TasteCard />
    </MyPage>
  );
}
