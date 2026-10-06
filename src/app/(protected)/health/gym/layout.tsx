import { requireUser } from "@/modules/core/session/guard";
import { GymNav } from "./_components/gym-nav";

/** Section tabs for every gym page. Checks the session like every protected
 * layout, but isn't the boundary on its own — each page still calls `requireUser()`. */
export default async function GymLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <GymNav />
      {children}
    </>
  );
}
