import { requireUnlocked } from "@/modules/core/session/guard";
import { SidebarNav } from "./sidebar-nav";
import { Breadcrumbs } from "./breadcrumbs";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireUnlocked();

  return (
    <div className="flex min-h-svh flex-col sm:flex-row">
      <SidebarNav />
      <main className="flex-1 overflow-x-auto p-4 pb-20 sm:p-8">
        <Breadcrumbs />
        {children}
      </main>
    </div>
  );
}
