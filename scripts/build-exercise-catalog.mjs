#!/usr/bin/env node
// Regenerates src/modules/health/data/exercise-catalog.json from the
// hasaneyldrm/exercises-dataset `data/exercises.json` (MIT — text and data
// only; the dataset's images/GIFs are © Gym visual and are NOT used).
//
//   curl -sL -o /tmp/exercises.json \
//     https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/<commit>/data/exercises.json
//   node scripts/build-exercise-catalog.mjs /tmp/exercises.json <commit>
//
// Keys are the dataset's own ids, so re-running against a newer dataset only
// adds rows (the seed in service/gym/catalog.ts inserts missing keys).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [, , input, commit = "unknown"] = process.argv;
if (!input) {
  console.error("usage: node scripts/build-exercise-catalog.mjs <exercises.json> [commit]");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(input, "utf8"));

// "barbell bench press (wide grip)" → "Barbell Bench Press (Wide Grip)"
function titleCase(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(^|[\s(/-])([a-z])/g, (_, lead, ch) => lead + ch.toUpperCase());
}

// Held for time rather than counted: static planks, isometrics, L-sits and
// loaded carries. Dynamic variants ("plank tap", "hang clean") stay reps.
const TIMED = /\b(plank|isometric|l-sit|wall sit|hollow body hold|carry|farmers walk)\b/i;
const NOT_TIMED = /\b(clean|snatch|tap|twist|wipers|lift|adduction|rear fly|push-up to)\b/i;
const UNILATERAL =
  /\b(single|one)[ -](arm|leg)\b|\balternat|\blunge|\bsplit squat|\bstep[ -]?up|\bpistol\b|\bbulgarian\b/i;

function stepsOf(entry) {
  const steps = entry.instruction_steps;
  if (steps && Array.isArray(steps.en))
    return steps.en.map((s) => String(s).trim()).filter(Boolean);
  const text =
    entry.instructions && typeof entry.instructions === "object" ? entry.instructions.en : "";
  return text ? [String(text).trim()] : [];
}

const exercises = raw
  .map((e) => {
    const bodyPart = String(e.body_part || e.category || "").trim();
    const name = titleCase(String(e.name));
    return {
      key: String(e.id),
      name,
      bodyPart,
      equipment: String(e.equipment || "").trim(),
      target: String(e.target || "").trim(),
      secondary: (e.secondary_muscles || []).map((m) => String(m).trim()).filter(Boolean),
      steps: stepsOf(e),
      mode:
        bodyPart === "cardio"
          ? "cardio"
          : TIMED.test(name) && !NOT_TIMED.test(name)
            ? "time"
            : "reps",
      bodyweight: String(e.equipment).trim() === "body weight",
      unilateral: UNILATERAL.test(name),
    };
  })
  .sort((a, b) => a.key.localeCompare(b.key));

const keys = new Set(exercises.map((e) => e.key));
if (keys.size !== exercises.length) throw new Error("duplicate dataset ids");

const out = {
  source: "https://github.com/hasaneyldrm/exercises-dataset",
  commit,
  license: "MIT (data and instruction text only — media excluded)",
  exercises,
};

const dest = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "src/modules/health/data/exercise-catalog.json",
);
writeFileSync(dest, JSON.stringify(out) + "\n");
console.log(`wrote ${exercises.length} exercises → ${path.relative(process.cwd(), dest)}`);
