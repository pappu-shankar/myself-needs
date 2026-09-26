"use client";

import { FURNITURE_CATEGORIES, type FurnitureCategory } from "@/modules/house/types";

/** The `dataTransfer` MIME type a drag from this catalog carries — `floor-plan-2d.tsx`'s drop handler reads it. */
export const FURNITURE_CATEGORY_MIME = "application/x-house-furniture-category";

const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  bed: "Bed",
  sofa: "Sofa",
  table: "Table",
  chair: "Chair",
  wardrobe: "Wardrobe",
  desk: "Desk",
  tv_unit: "TV unit",
  other: "Other",
};

/**
 * A draggable list of furniture categories — drag one onto the floor plan
 * (`FloorPlan2D`) to place a default-sized item of that category into
 * whichever room it's dropped on. Plain native HTML5 drag-and-drop, no extra
 * library — this repo has no drag/gesture dependency, and a simple
 * one-item-at-a-time drag doesn't need one.
 */
export function FurnitureCatalog() {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="list"
      aria-label="Furniture catalog — drag onto the floor plan to place"
    >
      {FURNITURE_CATEGORIES.map((category) => (
        <div
          key={category}
          role="listitem"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(FURNITURE_CATEGORY_MIME, category);
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="border-input bg-background text-foreground cursor-grab rounded-md border px-3 py-1.5 text-sm select-none active:cursor-grabbing"
        >
          {CATEGORY_LABELS[category]}
        </div>
      ))}
    </div>
  );
}
