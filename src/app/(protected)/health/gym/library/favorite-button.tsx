"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "lucide-react";
import { setExerciseFavoriteAction } from "@/modules/health/actions/gym/exercises";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  id,
  name,
  favorite,
  size = "icon-sm",
}: {
  id: number;
  name: string;
  favorite: boolean;
  size?: "icon-sm" | "icon";
}) {
  const [isFavorite, setFavorite] = useOptimistic(favorite);
  const [, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-pressed={isFavorite}
      aria-label={`Favorite ${name}`}
      onClick={() =>
        startTransition(async () => {
          const next = !isFavorite;
          setFavorite(next);
          await setExerciseFavoriteAction({ id, favorite: next });
        })
      }
    >
      <Star
        aria-hidden="true"
        className={cn(isFavorite ? "fill-current text-amber-500" : "text-muted-foreground")}
      />
    </Button>
  );
}
