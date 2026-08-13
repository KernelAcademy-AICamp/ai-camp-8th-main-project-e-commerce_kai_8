import { MosaicFeed } from "@/features/feed/presentation/components/mosaic-feed";

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-md items-center justify-center px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight text-white">eati</h1>
      </header>
      <MosaicFeed />
    </main>
  );
}
