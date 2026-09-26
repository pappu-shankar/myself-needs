import { redirect } from "next/navigation";
import { isDatabaseOpen } from "@/modules/core/db/client";
import { getSession } from "@/modules/core/session/session";

export default async function RootPage() {
  const session = await getSession();
  if (isDatabaseOpen() && session.unlocked) {
    redirect("/dashboard");
  }
  redirect("/unlock");
}
