// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural rules from AGENTS.md / docs/architecture, enforced so they can't
 * silently regress. Each failure message names the file to fix.
 */

const SRC = path.join(process.cwd(), "src");
const MODULES = readdirSync(path.join(SRC, "modules")).filter((name) =>
  statSync(path.join(SRC, "modules", name)).isDirectory(),
);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(SRC)
  .filter(
    (file) =>
      /\.(ts|tsx)$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file) && !file.endsWith(".d.ts"),
  )
  .map((file) => ({ file: path.relative(process.cwd(), file), text: readFileSync(file, "utf8") }));

function startsWithDirective(text: string, directive: string): boolean {
  const firstStatement = text.replace(/^(\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, "");
  return firstStatement.startsWith(`"${directive}"`) || firstStatement.startsWith(`'${directive}'`);
}

function importsOf(text: string): string[] {
  return [...text.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

/** The unlock/lock actions are the only public Server Actions — they are how a
 * session starts. */
const PUBLIC_ACTION_FILES = new Set(["src/modules/core/session/actions.ts"]);

describe("Server Actions", () => {
  const actionFiles = sourceFiles.filter(
    ({ file, text }) => startsWithDirective(text, "use server") && !PUBLIC_ACTION_FILES.has(file),
  );

  it("enforce the unlocked session at every action entry point", () => {
    const offenders: string[] = [];
    for (const { file, text } of actionFiles) {
      for (const match of text.matchAll(/^export\s+(async\s+function|function)\s+(\w+)/gm)) {
        const start = match.index ?? 0;
        const nextExport = text.indexOf("\nexport ", start + match[0].length);
        const body = text.slice(start, nextExport < 0 ? text.length : nextExport);
        if (!/await\s+requireUnlocked\(\)/.test(body)) {
          offenders.push(`${file}: ${match[2]} does not require an unlocked session`);
        }
      }
      for (const match of text.matchAll(/^export\s+const\s+(\w+)\s*=\s*([\s\S]{0,40})/gm)) {
        if (/^(defineFormAction|defineAction)\s*\(/.test(match[2].trimStart())) continue;
        const start = match.index ?? 0;
        const nextExport = text.indexOf("\nexport ", start + match[0].length);
        const body = text.slice(start, nextExport < 0 ? text.length : nextExport);
        if (!/await\s+requireUnlocked\(\)/.test(body)) {
          offenders.push(`${file}: ${match[1]} does not require an unlocked session`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Session checks", () => {
  it("run at the top of every protected page", () => {
    const offenders = sourceFiles
      .filter(({ file }) => file.startsWith("src/app/(protected)/") && file.endsWith("/page.tsx"))
      .filter(({ text }) => !/await requireUnlocked\(\)/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("run in every API route handler", () => {
    const offenders = sourceFiles
      .filter(({ file }) => file.startsWith("src/app/api/") && file.endsWith("/route.ts"))
      .filter(({ text }) => !/await requireUnlocked\(\)/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

describe("Import boundaries", () => {
  it("modules never import from each other (only from core)", () => {
    const offenders: string[] = [];
    for (const { file, text } of sourceFiles) {
      const own = /^src\/modules\/([^/]+)\//.exec(file)?.[1];
      if (!own) continue;
      for (const spec of importsOf(text)) {
        const other = /^@\/modules\/([^/]+)/.exec(spec)?.[1];
        if (other && other !== own && other !== "core") offenders.push(`${file} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("client components never import a module's barrel or its database layer", () => {
    const offenders: string[] = [];
    for (const { file, text } of sourceFiles.filter(({ text }) =>
      startsWithDirective(text, "use client"),
    )) {
      for (const spec of importsOf(text)) {
        const isTypeOnly = new RegExp(
          `import\\s+type\\s[^;]*?from\\s+["']${spec.replace(/[/.]/g, "\\$&")}["']`,
        ).test(text);
        if (isTypeOnly) continue;
        const barrel = MODULES.some(
          (m) => spec === `@/modules/${m}` || spec === `@/modules/${m}/index`,
        );
        const dbLayer =
          /^@\/modules\/[^/]+\/db(\/|$)/.test(spec) || spec === "@/modules/core/session/guard";
        if (barrel || dbLayer) offenders.push(`${file} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Dates", () => {
  it("never derive a calendar date from toISOString() (that's the UTC date — use @/lib/dates)", () => {
    const offenders = sourceFiles
      .filter(({ file }) => file !== "src/lib/dates.ts")
      .filter(({ text }) => /new\s+Date\(\)\.toISOString\(\)\s*\.slice\(0,\s*(?:8|10)\)/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
