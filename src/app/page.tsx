import { redirect } from "next/navigation";
import { getOptionalUser } from "@/modules/core/session/guard";

export default async function RootPage() {
  redirect((await getOptionalUser()) ? "/dashboard" : "/login");
}
