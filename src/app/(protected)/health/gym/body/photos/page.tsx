import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireUser } from "@/modules/core/session/guard";
import { todayIso } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { listProgressPhotos } from "@/modules/health";
import { PHOTO_POSES, PHOTO_POSE_LABELS, type PhotoPose } from "@/modules/health/types";
import { PageHeader } from "@/components/ui/page-header";
import { PhotosView } from "./photos-view";

export const metadata: Metadata = {
  title: "Progress photos — Gym — Personal Life OS",
};

/** Newest photos loaded per pose; the gallery says when there are more. */
const PAGE_SIZE = 200;

function parsePose(value: string | string[] | undefined): PhotoPose {
  const raw = Array.isArray(value) ? value[0] : value;
  return PHOTO_POSES.find((p) => p === raw) ?? "front";
}

export default async function ProgressPhotosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const pose = parsePose((await searchParams).pose);
  const { rows, total } = listProgressPhotos({ pose, limit: PAGE_SIZE });
  const photos = rows.map(({ id, date, pose: p, width, height, note, landmarks }) => ({
    id,
    date,
    pose: p,
    width,
    height,
    note,
    landmarks,
  }));

  return (
    <>
      <Link
        href="/health/gym/body"
        className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Body
      </Link>
      <PageHeader
        title="Progress photos"
        description="Front, side and back photos taken the same way each time, lined up so you can see the change."
      />
      <p className="text-muted-foreground mb-6 flex items-start gap-2 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Photos are stored inside your encrypted vault and never leave this device.
      </p>

      <nav aria-label="Photo pose" className="mb-6">
        <ul className="bg-muted inline-flex gap-1 rounded-lg p-1">
          {PHOTO_POSES.map((p) => (
            <li key={p}>
              <Link
                href={`/health/gym/body/photos?pose=${p}`}
                aria-current={p === pose ? "page" : undefined}
                className={cn(
                  "block rounded-md px-4 py-1.5 text-sm transition-colors",
                  p === pose
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {PHOTO_POSE_LABELS[p]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Keyed by pose so camera, review and compare state reset on a tab switch. */}
      <PhotosView key={pose} pose={pose} photos={photos} total={total} today={todayIso()} />
    </>
  );
}
