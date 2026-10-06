import { redirect } from "next/navigation";

/** The single-vault unlock screen was replaced by per-user sign-in. */
export default function UnlockPage() {
  redirect("/login");
}
