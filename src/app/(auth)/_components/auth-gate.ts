import "server-only";
import { redirect } from "next/navigation";
import { getInstallState } from "@/modules/core/auth/queries";
import { getOptionalUser, isRecoveryKeyPending } from "@/modules/core/session/guard";

export type AuthPage = "login" | "recover" | "invite" | "setup" | "claim";

export type AuthGate =
  /** Render the page. `pendingReveal`: the visitor just created their account
   * here and hasn't acknowledged their recovery key yet. */
  | { kind: "show"; pendingReveal: boolean }
  /** Half of a pre-multi-user vault is missing; nothing can be offered. */
  | { kind: "broken" };

/** Which pages make sense for each install state. */
const PAGES_FOR_STATE = {
  "legacy-claim": { home: "/claim", pages: ["claim"] },
  "fresh-setup": { home: "/setup", pages: ["setup"] },
  ready: { home: "/login", pages: ["login", "recover", "invite"] },
} as const satisfies Record<string, { home: string; pages: readonly AuthPage[] }>;

/**
 * The routing rules shared by every public auth page (call it first):
 *
 * - A signed-in visitor goes to /dashboard — except on /invite and /setup while
 *   their brand-new recovery key is still waiting to be acknowledged (the
 *   action that created the account re-renders this page with the key).
 * - Otherwise the install state decides: an unclaimed legacy vault → /claim, a
 *   fresh install → /setup, accounts exist → /login (or /login/recover,
 *   /invite), a half-present legacy vault → an explanatory card.
 */
export async function gateAuthPage(page: AuthPage): Promise<AuthGate> {
  const user = await getOptionalUser();
  if (user) {
    if ((page === "invite" || page === "setup") && (await isRecoveryKeyPending())) {
      return { kind: "show", pendingReveal: true };
    }
    redirect("/dashboard");
  }

  const state = getInstallState();
  if (state === "legacy-broken") return { kind: "broken" };
  const allowed = PAGES_FOR_STATE[state];
  if (!(allowed.pages as readonly AuthPage[]).includes(page)) redirect(allowed.home);
  return { kind: "show", pendingReveal: false };
}
