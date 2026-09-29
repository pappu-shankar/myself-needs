"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Shown when a protected page fails to render. The server has logged the
 * details; production builds only expose the digest, which matches that log. */
export default function ProtectedError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <EmptyState
      role="alert"
      icon={AlertTriangle}
      title="This page couldn't load"
      description={
        error.digest
          ? `Something went wrong on our side. Your data hasn't been changed. (Reference: ${error.digest})`
          : "Something went wrong on our side. Your data hasn't been changed."
      }
      action={
        <div className="flex gap-2">
          <Button variant="default" onClick={() => retry()}>
            Try again
          </Button>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            Go to dashboard
          </Link>
        </div>
      }
    />
  );
}
