import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/modules/core/session/session";
import { currentEpoch, recordActivity } from "@/modules/core/session/unlock-state";

/** True when the encrypted db is open in this server process AND this browser's
 * cookie belongs to the current unlock (not a revoked earlier one). */
export async function isUnlocked(): Promise<boolean> {
  const epoch = currentEpoch();
  if (!epoch) return false;
  const session = await getSession();
  return session.unlocked === true && session.epoch === epoch;
}

/**
 * Call at the top of every protected page and (via the action wrapper) every
 * Server Action. Layout-level checks alone aren't a boundary in the App Router:
 * page segments render independently of their layout. Redirects to /unlock.
 */
export async function requireUnlocked(): Promise<void> {
  if (!(await isUnlocked())) {
    redirect("/unlock");
  }
  recordActivity();
}
