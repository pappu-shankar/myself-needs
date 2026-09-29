"use client";

import { useEffect, useRef } from "react";
import type { ActionState } from "@/modules/core/action/types";

/**
 * Runs `onSuccess` once per successful submission — each action call returns a
 * fresh state object, so an `ok` state is seen exactly once. Use it to close a
 * dialog or reset a form after `useActionState` reports success.
 */
export function useActionSuccess<T>(
  state: ActionState<T>,
  onSuccess: (data: T | undefined) => void,
): void {
  const callback = useRef(onSuccess);
  useEffect(() => {
    callback.current = onSuccess;
  });
  useEffect(() => {
    if (state.ok) callback.current(state.data);
  }, [state]);
}
