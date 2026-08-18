import { readAuthNotice } from "@/features/auth/domain/auth-session";
import { AccountSection } from "@/features/auth/presentation/components/account-section";
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
    <main className="mx-auto max-w-md px-4 py-6 text-neutral-200">
      <SettingsHeader />
      <AccountSection notice={notice} />
      <PrivacySettings />
    </main>
  );
}
