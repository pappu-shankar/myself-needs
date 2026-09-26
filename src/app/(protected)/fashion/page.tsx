import type { Metadata } from "next";
import Link from "next/link";
import { getPhotos } from "@/modules/fashion";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { UploadForm } from "./upload-form";
import { PhotoList } from "./photo-list";

export const metadata: Metadata = {
  title: "Fashion — Personal Life OS",
};

export default function FashionPage() {
  const photos = getPhotos();

  return (
    <>
      <PageHeader
        title="Fashion"
        description="Upload a photo to see your physique summary and dress your character from your wardrobe."
        actions={
          <Link href="/fashion/wardrobe" className={buttonVariants({ variant: "outline" })}>
            Wardrobe
          </Link>
        }
      />

      {photos.length === 0 ? (
        <EmptyState
          title="No photos yet"
          description="Upload a full-body photo to get started."
          action={<UploadForm />}
        />
      ) : (
        <>
          <UploadForm />
          <PhotoList photos={photos} />
        </>
      )}
    </>
  );
}
