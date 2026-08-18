import { CurationPane } from "@/features/curation/presentation/components/curation-pane";
import { HomeShell } from "@/features/shell/presentation/components/home-shell";

export default function Home() {
  return (
    <main>
      <HomeShell forYou={<CurationPane />} />
    </main>
  );
}
