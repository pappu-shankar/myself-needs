"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { GymStats } from "@/modules/health";
import type { Sex } from "@/modules/health/types";
import { BodyMap, MuscleChips } from "../_components/body-map";
import { hasMuscleLoad } from "./stats-helpers";

type View = "all" | "hard";

const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All working sets" },
  { key: "hard", label: "Hard sets only" },
];

interface MuscleMapCardProps {
  muscles: GymStats["muscles"];
  hardMuscles: GymStats["hardMuscles"];
  figure: Sex;
  initialView?: View;
}

/** The muscle map with an "all working sets / hard sets only" switch. */
export function MuscleMapCard({
  muscles,
  hardMuscles,
  figure,
  initialView = "all",
}: MuscleMapCardProps) {
  const [view, setView] = useState<View>(initialView);
  const name = useId();
  const data = view === "hard" ? hardMuscles : muscles;
  const hardEmpty = view === "hard" && !hasMuscleLoad(hardMuscles) && hasMuscleLoad(muscles);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">Which sets to count</legend>
        {VIEWS.map((v) => (
          <label
            key={v.key}
            className="has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:border-primary has-[:focus-visible]:ring-ring/50 hover:bg-muted cursor-pointer rounded-full border px-3 py-1 text-sm has-[:focus-visible]:ring-2 has-[:checked]:hover:bg-primary"
          >
            <input
              type="radio"
              name={name}
              value={v.key}
              checked={view === v.key}
              onChange={() => setView(v.key)}
              className="sr-only"
            />
            {v.label}
          </label>
        ))}
      </fieldset>
      {view === "hard" && (
        <p className="text-muted-foreground text-sm">
          Counts only sets you rated within about 3 reps of failure (RIR 3 or less, RPE 7 or more).
          Unrated sets are left out.
        </p>
      )}
      {hardEmpty && (
        <p role="note" className="bg-muted rounded-md px-3 py-2 text-sm">
          No hard sets in this period. Hard sets need an effort rating (RIR or RPE) on each set —
          turn effort ratings on in{" "}
          <Link href="/health/gym/settings" className="underline underline-offset-2">
            gym settings
          </Link>
          .
        </p>
      )}
      <BodyMap
        levels={data.levels}
        values={data.load}
        valueLabel={view === "hard" ? "hard sets" : "sets"}
        figure={figure}
        title={view === "hard" ? "Hard sets per muscle" : "Sets per muscle"}
      />
      <MuscleChips
        muscles={data.missed}
        label={view === "hard" ? "No hard sets in this period:" : "Not trained in this period:"}
      />
    </div>
  );
}
