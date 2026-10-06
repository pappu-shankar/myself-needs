import { redirect } from "next/navigation";
import { getMyProfile, listMyAlerts, listMySpaces } from "@/modules/core/auth/queries";
import { requireUser } from "@/modules/core/session/guard";
import { SidebarNav } from "./sidebar-nav";
import { Breadcrumbs } from "./breadcrumbs";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const scope = await requireUser();
  const profile = getMyProfile(scope);
  if (!profile) redirect("/login");

  const spaces = listMySpaces(scope);
  const activeSpace = spaces.find((s) => s.active) ?? null;
  const alertCount = listMyAlerts(scope.userId).length;

  return (
    <div className="flex min-h-svh flex-col sm:flex-row">
      <SidebarNav
        user={{
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          color: profile.color,
          hasAvatar: profile.hasAvatar,
          avatarVersion: profile.avatarVersion,
        }}
        isAdmin={profile.role === "admin"}
        spaces={spaces.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
          modules: s.modules,
          active: s.active,
        }))}
        enabledModules={activeSpace ? activeSpace.modules : null}
        alertCount={alertCount}
      />
      <main className="min-w-0 flex-1 overflow-x-auto p-4 pb-20 sm:p-8">
        <Breadcrumbs />
        {children}
      </main>
    </div>
  );
}
