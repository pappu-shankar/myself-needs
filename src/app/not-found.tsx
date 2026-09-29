import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <EmptyState
        className="w-full max-w-md"
        icon={SearchX}
        title="Page not found"
        description="That page doesn't exist, or the item it pointed to has been deleted."
        action={
          <Link href="/dashboard" className={buttonVariants({ variant: "default" })}>
            Go to dashboard
          </Link>
        }
      />
    </main>
  );
}
