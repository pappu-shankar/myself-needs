"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/modules/core/action/types";

/**
 * Runs a programmatic (non-form) Server Action in a transition and keeps its
 * error for display. Success refreshes the page on its own (the action
 * wrapper revalidates), so callers only need `onSuccess` for navigation.
 */
export function useRunAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T>(
    action: () => Promise<ActionState<T>>,
    onSuccess?: (data: T | undefined) => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSuccess?.(result.data);
      else setError(result.error ?? "Something went wrong. Please try again.");
    });
  }

  return { pending, error, run, clearError: () => setError(null) };
}
