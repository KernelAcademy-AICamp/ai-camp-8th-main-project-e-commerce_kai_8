// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MyPage } from "@/features/auth/presentation/components/my-page";
import { ProfileActivityCard } from "@/features/feed/presentation/components/profile-activity-card";
import { TasteCard } from "@/features/taste/presentation/components/taste-card";

import MyLoading from "./loading";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/my",
}));

// 판정이 끝나지 않은 상태로 붙잡아 둔다 — 도착 직후의 첫 그림이 비교 대상이다
vi.mock("@/features/auth/data/auth-repository", () => ({
  fetchVerifiedUser: () => new Promise(() => undefined),
  signOutThisDevice: () => new Promise(() => undefined),
  subscribeAuthChange: () => () => undefined,
}));

vi.mock("@/shared/supabase/use-signed-in", () => ({
  useSignedIn: () => "unknown",
}));

describe("마이페이지 로딩 화면", () => {
  it("도착 직후 화면과 완전히 같은 그림이다 — 스켈레톤이 두 번 튀지 않는다", () => {
    // 누른 직후 보이는 것
    const whileNavigating = render(<MyLoading />).container.innerHTML;
    cleanup();

    // 응답이 도착해 페이지가 처음 그려진 것 (아직 로그인 판정 전)
    const onArrival = render(
      <MyPage notice={null}>
        <TasteCard />
        <ProfileActivityCard />
      </MyPage>,
    ).container.innerHTML;
    cleanup();

    expect(onArrival).toBe(whileNavigating);
  });
});
