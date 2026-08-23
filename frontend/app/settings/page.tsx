import { readAuthNotice } from "@/features/auth/domain/auth-session";
import { AccountDeleteSection } from "@/features/auth/presentation/components/account-delete-section";
import { AppVersionLine } from "@/features/settings/presentation/components/app-version-line";
import { GenderSettings } from "@/features/settings/presentation/components/gender-settings";
import { PrivacySettings } from "@/features/settings/presentation/components/privacy-settings";
import { SettingsHeader } from "@/features/settings/presentation/components/settings-header";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = params.auth;
  const notice = readAuthNotice(typeof auth === "string" ? auth : null);

  return (
    <main className="mx-auto max-w-md px-4 pb-6 text-ink">
      <SettingsHeader />
      <GenderSettings />
      <PrivacySettings />
      <AccountDeleteSection notice={notice} />
      <AppVersionLine />
    </main>
  );
}
