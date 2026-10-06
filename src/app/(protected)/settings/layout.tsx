import { listMyAlerts } from "@/modules/core/auth/queries";
import { requireUser } from "@/modules/core/session/guard";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const scope = await requireUser();
  const alertCount = listMyAlerts(scope.userId).length;
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        description="Your profile, sign-in and devices."
        className="pb-0"
      />
      <SettingsTabs alertCount={alertCount} />
      {children}
    </div>
  );
}
