"use client";

import { useEffect, useId, useState } from "react";
import { Star } from "lucide-react";
import {
  searchExercisesAction,
  type ExerciseSearchResult,
} from "@/modules/health/actions/gym/exercise-search";
import { BODY_PARTS } from "@/modules/health/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;

interface ExercisePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (exercise: ExerciseSearchResult) => void;
  title?: string;
  description?: string;
}

/**
 * Search-and-pick over the whole exercise library (catalog + custom), shared
 * by the routine editor and the live workout. Results come from the server a
 * page at a time; favorites sort first.
 */
export function ExercisePicker({
  open,
  onOpenChange,
  onPick,
  title = "Add exercise",
  description = "Search 1,300+ exercises or your own.",
}: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [results, setResults] = useState<ExerciseSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyPartId = useId();

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      setLoading(true);
      searchExercisesAction({
        query: query.trim() || undefined,
        bodyPart: bodyPart || undefined,
        ownedEquipmentOnly: ownedOnly || undefined,
        limit: PAGE_SIZE,
      }).then((state) => {
        setLoading(false);
        if (state.ok && state.data) {
          setResults(state.data.rows);
          setTotal(state.data.total);
          setError(null);
        } else {
          setError(state.error ?? "Couldn't search exercises.");
        }
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [open, query, bodyPart, ownedOnly]);

  async function loadMore() {
    setLoading(true);
    const state = await searchExercisesAction({
      query: query.trim() || undefined,
      bodyPart: bodyPart || undefined,
      ownedEquipmentOnly: ownedOnly || undefined,
      limit: PAGE_SIZE,
      offset: results.length,
    });
    setLoading(false);
    if (state.ok && state.data) setResults((prev) => [...prev, ...state.data!.rows]);
  }

  function pick(exercise: ExerciseSearchResult) {
    onPick(exercise);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85svh] flex-col gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          type="search"
          autoFocus
          aria-label="Search exercises"
          placeholder="e.g. bench, romanian deadlift"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor={bodyPartId} className="sr-only">
            Body part
          </label>
          <select
            id={bodyPartId}
            value={bodyPart}
            onChange={(e) => setBodyPart(e.target.value)}
            className="border-input bg-background h-8 rounded-md border px-2 text-sm capitalize"
          >
            <option value="">All body parts</option>
            {BODY_PARTS.map((part) => (
              <option key={part} value={part}>
                {part}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ownedOnly}
              onChange={(e) => setOwnedOnly(e.target.checked)}
            />
            Only equipment I have
          </label>
        </div>
        <p className="text-muted-foreground text-xs" aria-live="polite">
          {loading ? "Searching…" : `${total.toLocaleString("en-IN")} exercises`}
        </p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {results.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => pick(exercise)}
                className="hover:bg-muted focus-visible:bg-muted flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left text-sm outline-none"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{exercise.name}</span>
                  <span className="text-muted-foreground block text-xs capitalize">
                    {exercise.bodyPart} · {exercise.equipment}
                    {exercise.isCustom ? " · custom" : ""}
                  </span>
                </span>
                {exercise.isFavorite && (
                  <Star
                    className={cn("text-primary mt-0.5 size-4 shrink-0 fill-current")}
                    aria-label="Favorite"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
        {results.length < total && (
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={loadMore}>
            Show more
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
