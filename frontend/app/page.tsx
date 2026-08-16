import Link from "next/link";

import { MosaicFeed } from "@/features/feed/presentation/components/mosaic-feed";
import { ConsentNotice } from "@/features/settings/presentation/components/consent-notice";

export default function Home() {
  return (
    <main>
      <header className="relative mx-auto flex max-w-md items-center justify-center px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight text-white">aTee</h1>
        <Link
          href="/settings"
          aria-label="개인화 안내·설정"
          className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-400"
        >
          ⓘ
        </Link>
      </header>
      <MosaicFeed />
      <ConsentNotice />
    </main>
  );
}
