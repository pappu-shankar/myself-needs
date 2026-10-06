import { requireAdmin } from "@/modules/core/session/guard";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-4">
      <AdminNav />
      {children}
    </div>
  );
}
