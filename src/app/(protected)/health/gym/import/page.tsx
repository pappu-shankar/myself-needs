import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { PageHeader } from "@/components/ui/page-header";
import { AppleHealthImport } from "./apple-health-import";
import { BackupPanel } from "./backup-panel";
import { PlanFileImport } from "./plan-file-import";
import { WorkoutImport } from "./workout-import";

export const metadata: Metadata = {
  title: "Import & export — Gym — Personal Life OS",
};

export default async function GymImportPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Import & export"
        description="Bring in history from other apps, share a plan, or back up your gym data."
      />
      <div className="flex flex-col gap-6">
        <WorkoutImport />
        <AppleHealthImport />
        <PlanFileImport />
        <BackupPanel />
      </div>
    </>
  );
}
