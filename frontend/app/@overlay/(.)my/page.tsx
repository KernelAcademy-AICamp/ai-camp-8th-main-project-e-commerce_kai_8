"use client";

import { useEffect } from "react";

import { GuestLoginPopup } from "@/features/auth/presentation/components/guest-login-popup";
import { MyPage } from "@/features/auth/presentation/components/my-page";
import { RecentStrip } from "@/features/feed/presentation/components/recent-strip";
import { ProfileStats } from "@/features/feed/wishlist/presentation/components/profile-stats";
import { TasteCard } from "@/features/taste/presentation/components/taste-card";

/**
 * 홈에서 프로필을 열었을 때 — **홈 위에 겹쳐** 그린다.
 *
 * 주소는 그대로 `/my`다. 앱 안에서 넘어올 때만 이 자리가 쓰이고, 주소를 직접 치거나
 * 새로고침하면 `app/my/page.tsx`(단독 화면)가 대신 그려진다. 그래서 주소·뒤로가기·
 * 공유는 그대로 살아 있으면서, 옆에서 밀려나올 때 **뒤에 홈이 남아 보인다** —
 * 시안이 사이드바를 열 때 홈이 살짝 줄어들며 물러나는 그 깊이감이다.
 *
 * 서버를 기다리지 않는다. `?auth=` 안내는 로그인에서 돌아올 때만 붙는데 그것은
 * 주소로 들어오는 경로라 단독 화면이 맡는다.
 */
export default function ProfileOverlay() {
  // 뒤에 남은 홈이 살짝 줄어들며 물러난다 (시안 `.screen.side-open`)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("profile-open");
    return () => {
      root.classList.remove("profile-open");
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain">
      <MyPage notice={null}>
        <TasteCard />
        <RecentStrip />
        <ProfileStats />
      </MyPage>
      {/* 비회원 안내는 판 바깥 — 판이 밀려 들어오는 동안의 변형에 끌려가지 않게 */}
      <GuestLoginPopup />
    </div>
  );
}
