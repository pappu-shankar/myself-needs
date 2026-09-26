import { defineConfig } from "drizzle-kit";

// Each module owns its schema under src/modules/<module>/db/schema/ — drizzle-kit
// scans all of them together since they share one physical (encrypted) database
// file, even though the application code never lets modules import each other's
// schema directly. See docs/architecture/data-model.md.
//
// IMPORTANT: only ever run `drizzle-kit generate` from this config — it diffs
// schema files and writes SQL, without opening the actual database file. Never
// run `drizzle-kit migrate`/`push`/`pull`/`studio` against ./data/app.db — those
// commands open the file with drizzle-kit's own plain (non-SQLCipher) connection
// and will fail against — or corrupt — the encrypted file. Migrations are applied
// programmatically instead, via modules/core/db/client.ts, using the app's own
// already-authenticated connection. See docs/architecture/data-model.md.
export default defineConfig({
  // Covers both flat `db/schema.ts` (skeleton modules) and, once a module grows
  // deep like finance, a `db/schema/**/*.ts` tree split by concern (finance
  // nests further into `db/schema/{config,domain}/*.ts` — the glob must stay
  // recursive (`**`), not `db/schema/*.ts`, or drizzle-kit silently stops
  // seeing those tables).
  schema: ["./src/modules/*/db/schema.ts", "./src/modules/*/db/schema/**/*.ts"],
  out: "./drizzle",
  dialect: "sqlite",
});
