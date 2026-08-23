import { FolderDetailView } from "@/features/feed/wishlist/presentation/components/folder-detail-view";
import { OnboardingGate } from "@/features/onboarding/presentation/components/onboarding-gate";

/** 폴더 상세. "default"가 기본 폴더, 나머지는 폴더 id. */
export default async function WishlistFolderPage({
  params,
}: {
  params: Promise<{ folder: string }>;
}) {
  const { folder } = await params;
  return (
    <main>
      {/* 목록과 같은 게이트 — 한쪽만 막으면 다른 쪽으로 샌다 */}
      <OnboardingGate>
        <FolderDetailView folderParam={folder} />
      </OnboardingGate>
    </main>
  );
}
