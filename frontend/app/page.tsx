import Link from "next/link";

import { MosaicFeed } from "@/features/feed/presentation/components/mosaic-feed";
import { ConsentNotice } from "@/features/settings/presentation/components/consent-notice";

export default function Home() {
  return (
    <main>
      <header className="relative mx-auto flex max-w-md items-center justify-center px-4 py-3">
        <Link href="/curation" className="absolute left-4 text-sm text-neutral-400">
          큐레이션
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-white">aTee</h1>
        <div className="absolute right-3 flex items-center">
          <Link
            href="/wishlist"
            aria-label="찜 보관함"
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-400"
          >
            ♡
          </Link>
          <Link
            href="/settings"
            aria-label="개인화 안내·설정"
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-400"
          >
            ⓘ
          </Link>
        </div>
      </header>
      <MosaicFeed />
      <ConsentNotice />
    </main>
  );
}
