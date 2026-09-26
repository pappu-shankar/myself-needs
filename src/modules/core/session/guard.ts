import "server-only";
import { redirect } from "next/navigation";
import { isDatabaseOpen } from "@/modules/core/db/client";
import { getSession } from "@/modules/core/session/session";

/** Call at the top of any protected layout/page. Redirects to /unlock unless
 * both the encrypted db is open in this server process AND the browser has a
 * valid session cookie for it. */
export async function requireUnlocked(): Promise<void> {
  const session = await getSession();
  if (!isDatabaseOpen() || !session.unlocked) {
    redirect("/unlock");
  }
}
