"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { startWorkoutAction } from "@/modules/health/actions/gym/session";
import { Button } from "@/components/ui/button";
import { useRunAction } from "../use-run-action";

export function StartWorkoutButton({ routineId }: { routineId: number }) {
  const router = useRouter();
  const { pending, error, run } = useRunAction();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="default"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set("routineId", String(routineId));
          run(
            () => startWorkoutAction({}, formData),
            () => router.push("/health/gym/workout"),
          );
        }}
      >
        <Play aria-hidden="true" /> {pending ? "Starting…" : "Start this workout"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-right text-sm">
          {error}
          {/progress|already|active/i.test(error) && (
            <>
              {" "}
              <Link
                href="/health/gym/workout"
                className="text-primary underline-offset-4 hover:underline"
              >
                Go to the workout
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
