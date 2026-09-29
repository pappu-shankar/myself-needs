import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import { getGarments } from "@/modules/fashion";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { GarmentUploadForm } from "./garment-upload-form";
import { GarmentGrid } from "./garment-grid";

export const metadata: Metadata = {
  title: "Wardrobe — Personal Life OS",
};

export default async function WardrobePage() {
  await requireUnlocked();
  const garments = getGarments();

  return (
    <>
      <PageHeader
        title="Wardrobe"
        description="Upload photos of shirts and pants you own — pick from these when dressing your character."
      />

      {garments.length === 0 ? (
        <EmptyState
          title="No garments yet"
          description="Upload a shirt or pants photo to get started."
          action={<GarmentUploadForm />}
        />
      ) : (
        <>
          <GarmentUploadForm />
          <GarmentGrid garments={garments} />
        </>
      )}
    </>
  );
}
