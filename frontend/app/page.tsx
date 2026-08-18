import { CurationPane } from "@/features/curation/presentation/components/curation-pane";
import { ConsentNotice } from "@/features/settings/presentation/components/consent-notice";
import { HomeShell } from "@/features/shell/presentation/components/home-shell";

export default function Home() {
  return (
    <main>
      <HomeShell forYou={<CurationPane />} />
      <ConsentNotice />
    </main>
  );
}
