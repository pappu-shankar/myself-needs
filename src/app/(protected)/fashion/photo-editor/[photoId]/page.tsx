import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import { notFound } from "next/navigation";
import { getPhoto } from "@/modules/fashion";
import { PageHeader } from "@/components/ui/page-header";
import { EditorWorkspace } from "./editor-workspace";

export const metadata: Metadata = {
  title: "Live preview — Personal Life OS",
};

export default async function PhotoEditorPage({
  params,
}: {
  params: Promise<{ photoId: string }>;
}) {
  await requireUnlocked();
  const { photoId } = await params;
  const id = Number(photoId);
  const photo = Number.isInteger(id) ? getPhoto(id) : null;
  if (!photo) notFound();

  return (
    <>
      <PageHeader
        title="Live preview"
        description="Adjust shirt and pants colors and see them update instantly."
      />
      <EditorWorkspace photo={photo} />
    </>
  );
}
