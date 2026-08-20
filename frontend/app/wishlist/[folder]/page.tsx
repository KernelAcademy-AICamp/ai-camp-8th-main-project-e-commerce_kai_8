import { FolderDetailView } from "@/features/feed/wishlist/presentation/components/folder-detail-view";

/** 폴더 상세. "default"가 기본 폴더, 나머지는 폴더 id. */
export default async function WishlistFolderPage({
  params,
}: {
  params: Promise<{ folder: string }>;
}) {
  const { folder } = await params;
  return (
    <main>
      <FolderDetailView folderParam={folder} />
    </main>
  );
}
