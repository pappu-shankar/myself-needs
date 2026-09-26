import Link from "next/link";
import type { getPhotos } from "@/modules/fashion";

type Photo = ReturnType<typeof getPhotos>[number];

/** Links each photo into its live-recolor editor. See docs/prd/fashion.md. */
export function PhotoList({ photos }: { photos: Photo[] }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {photos.map((photo) => (
        <Link
          key={photo.id}
          href={`/fashion/photo-editor/${photo.id}`}
          className="border-border hover:border-ring block overflow-hidden rounded-lg border transition-colors"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- served from a
              runtime, session-gated Route Handler, not a static/optimizable asset */}
          <img
            src={`/api/fashion/photos/${photo.filename}`}
            alt={photo.originalName ?? "Uploaded photo"}
            className="aspect-3/4 w-full object-cover"
          />
        </Link>
      ))}
    </div>
  );
}
