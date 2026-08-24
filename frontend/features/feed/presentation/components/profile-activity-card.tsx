"use client";

import { ProfileStats } from "@/features/feed/wishlist/presentation/components/profile-stats";
import { useSignedIn } from "@/shared/supabase/use-signed-in";

import { RecentStrip } from "./recent-strip";

/**
 * 최근 본 제품 + 활동 요약(저장한 핀·폴더·이번 주 발견) — 내 취향 카드와 같은
 * 테두리(`rounded-2xl border border-line p-5`)로 한 카드에 묶는다(2026-08-25).
 * 예전엔 각자 페이지 레벨 구획이라 카드 하나(내 취향) 아래 테두리 없는 두
 * 구역이 이어지는 모양이었다.
 *
 * **비회원일 때는 테두리를 두르지 않는다.** 내 취향 카드의 비회원 자리
 * (`TasteGuestSkeleton`)와 같은 결정이다 — 로그인해야 채워지는 내용에 완성된
 * 틀을 씌우면 "이미 다 갖춰진 화면"으로 잘못 읽힌다.
 */
export function ProfileActivityCard() {
  const signedIn = useSignedIn();

  if (signedIn !== "in") {
    return (
      <>
        <RecentStrip />
        <ProfileStats />
      </>
    );
  }

  return (
    <section className="mt-10 rounded-2xl border border-line p-5">
      <RecentStrip />
      <ProfileStats />
    </section>
  );
}
