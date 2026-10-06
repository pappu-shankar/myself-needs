import type { ReactNode } from "react";
import { requireUser } from "@/modules/core/session/guard";
import { FinanceSectionNav } from "./section-nav";

/**
 * Finance had no layout at all before this: every page repeated its own
 * "Back to Finance" button, and there was nothing showing where in the module
 * you were. The section nav lives here so it renders once per navigation rather
 * than per page, and so a new page cannot forget it.
 */
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <>
      <FinanceSectionNav />
      {children}
    </>
  );
}
