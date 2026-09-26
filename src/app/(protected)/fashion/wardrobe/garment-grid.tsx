"use client";

import { useState } from "react";
import { deleteGarmentAction } from "@/modules/fashion/actions";
import type { getGarments } from "@/modules/fashion";
import { Button } from "@/components/ui/button";

type Garment = ReturnType<typeof getGarments>[number];

const CATEGORY_LABELS: Record<Garment["category"], string> = { shirt: "Shirt", pants: "Pants" };

export function GarmentGrid({ garments }: { garments: Garment[] }) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    setDeletingId(id);
    const formData = new FormData();
    formData.set("id", String(id));
    await deleteGarmentAction({}, formData);
    setDeletingId(null);
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {garments.map((garment) => (
        <div key={garment.id} className="border-border overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element -- served from a
              runtime, session-gated Route Handler, not a static/optimizable asset */}
          <img
            src={`/api/fashion/garments/${garment.filename}`}
            alt={garment.originalName ?? garment.category}
            className="bg-muted aspect-square w-full object-contain p-2"
          />
          <div className="flex items-center justify-between gap-2 p-2">
            <span className="flex items-center gap-1.5 text-xs">
              <span
                className="border-border inline-block size-3 rounded-full border"
                style={{ backgroundColor: garment.representativeColorHex }}
              />
              {CATEGORY_LABELS[garment.category]}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deletingId === garment.id}
              onClick={() => handleDelete(garment.id)}
            >
              {deletingId === garment.id ? "…" : "Delete"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
