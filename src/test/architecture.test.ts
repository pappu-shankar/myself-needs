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

/**
 * Like `sourceFiles` but *including* tests. The UTC-date trap bites a fixture
 * just as hard as production code, and a test that derives "today" in UTC only
 * fails between midnight and the local UTC offset — a 5.5-hour window in IST,
 * which is how five of them sat broken without anyone noticing.
 */
const dateScanFiles = walk(SRC)
  .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts"))
  .map((file) => ({ file: path.relative(process.cwd(), file), text: readFileSync(file, "utf8") }));

function startsWithDirective(text: string, directive: string): boolean {
  const firstStatement = text.replace(/^(\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, "");
  return firstStatement.startsWith(`"${directive}"`) || firstStatement.startsWith(`'${directive}'`);
}

function importsOf(text: string): string[] {
  return [...text.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

/** The sign-in/sign-up/sign-out actions are the only public Server Actions —
 * they are how a session starts. */
const PUBLIC_ACTION_FILES = new Set(["src/modules/core/auth/actions.ts"]);

/** A hand-written action body must run inside the user's request scope —
 * `withUser` (or, for the auth/admin files, the action-level guards). A bare
 * `requireUser()` binds a render scope only, which `getDb()` can't see here. */
const GUARD_CALL = /await\s+(requireUserForAction|requireAdminForAction|withUser)\(/;

/** Top-level `export async function name(` bodies, each up to the next top-level export. */
function exportedFunctions(text: string): { name: string; body: string }[] {
  return [...text.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm)].map(
    (match) => {
      const start = match.index ?? 0;
      const nextExport = text.indexOf("\nexport ", start + match[0].length);
      return { name: match[1], body: text.slice(start, nextExport < 0 ? text.length : nextExport) };
    },
  );
}

describe("Server Actions", () => {
  const actionFiles = sourceFiles.filter(
    ({ file, text }) => startsWithDirective(text, "use server") && !PUBLIC_ACTION_FILES.has(file),
  );

  it("run every exported action inside the user's scope (define*Action or withUser)", () => {
    const offenders: string[] = [];
    for (const { file, text } of actionFiles) {
      for (const { name, body } of exportedFunctions(text)) {
        if (!GUARD_CALL.test(body)) {
          offenders.push(`${file}: ${name} is neither define*Action nor wrapped in withUser`);
        }
      }
      for (const match of text.matchAll(/^export\s+const\s+(\w+)\s*=\s*([\s\S]{0,40})/gm)) {
        if (/^(defineFormAction|defineAction|defineAdminAction)\s*\(/.test(match[2].trimStart())) {
          continue;
        }
        const start = match.index ?? 0;
        const nextExport = text.indexOf("\nexport ", start + match[0].length);
        const body = text.slice(start, nextExport < 0 ? text.length : nextExport);
        if (!GUARD_CALL.test(body)) {
          offenders.push(`${file}: ${match[1]} is neither define*Action nor wrapped in withUser`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Admin code", () => {
  // Admins manage accounts; they must never be able to read anyone's vault.
  it("never touches vault connections (no getDb/openVault in admin files)", () => {
    const offenders = sourceFiles
      .filter(({ file }) => /^src\/modules\/core\/auth\/admin-[^/]+\.ts$/.test(file))
      .filter(({ text }) => /\b(getDb|openVault|runWithScope|setTestDefaultDatabase)\b/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

describe("Request scope", () => {
  it("never uses AsyncLocalStorage.enterWith", () => {
    const offenders = sourceFiles
      .filter(({ text }) => /\.enterWith\s*\(/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

describe("Session checks", () => {
  const protectedPages = sourceFiles.filter(
    ({ file }) => file.startsWith("src/app/(protected)/") && /\/(page|layout)\.tsx$/.test(file),
  );

  it("run at the top of every protected page and layout", () => {
    const offenders = protectedPages
      .filter(({ text }) => !/await (requireUser|requireAdmin)\(/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  // generateMetadata can run before (or without) the page body, so one that
  // reads data must bind the scope itself.
  it("run first in every generateMetadata that calls into a module", () => {
    const offenders: string[] = [];
    for (const { file, text } of protectedPages) {
      const moduleImports = [
        ...text.matchAll(/import\s+\{([^}]*)\}\s+from\s+["']@\/modules\/(?!core\/)[^"']+["']/g),
      ].flatMap((m) =>
        m[1]
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name && !name.startsWith("type "))
          .map((name) =>
            name
              .split(/\s+as\s+/)
              .pop()!
              .trim(),
          ),
      );
      for (const { name, body } of exportedFunctions(text)) {
        if (name !== "generateMetadata") continue;
        const callsModule = moduleImports.some((fn) => new RegExp(`\\b${fn}\\(`).test(body));
        if (!callsModule) continue;
        const guard = body.search(/await requireUser\(/);
        const firstCall = Math.min(
          ...moduleImports
            .map((fn) => body.search(new RegExp(`\\b${fn}\\(`)))
            .filter((index) => index >= 0),
        );
        if (guard < 0 || guard > firstCall) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("run in every API route handler, inside the request scope", () => {
    const offenders: string[] = [];
    for (const { file, text } of sourceFiles.filter(
      ({ file }) => file.startsWith("src/app/api/") && file.endsWith("/route.ts"),
    )) {
      for (const { name, body } of exportedFunctions(text)) {
        if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(name)) continue;
        if (!/await withUser\(/.test(body)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never use the removed requireUnlocked alias", () => {
    const offenders = sourceFiles
      .filter(({ text }) => /\brequireUnlocked\b/.test(text))
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
    // Matches any `.toISOString().slice(0, 8|10)`, not just the inlined
    // `new Date().toISOString()` form — splitting it across a local helper
    // (`isoDate(d)` called with `new Date()`) is the same bug wearing a hat, and
    // is exactly what slipped past the previous version of this rule.
    //
    // Two forms are legitimate and allowed, because they build a date in UTC and
    // read it straight back rather than asking what day it is: `Date.UTC(...)` in
    // the same statement, and parse-then-verify comparisons (`... !== value`).
    const offenders: string[] = [];
    for (const { file, text } of dateScanFiles) {
      if (file === "src/lib/dates.ts") continue;
      // Collapse whitespace so a chain broken across lines is still one statement.
      for (const statement of text.replace(/\s+/g, " ").split(";")) {
        if (!/\.toISOString\(\) ?\.slice\(0, ?(?:8|10)\)/.test(statement)) continue;
        if (/Date\.UTC\(/.test(statement)) continue;
        if (/\.slice\(0, ?(?:8|10)\) ?(?:!==|===)/.test(statement)) continue;
        offenders.push(file);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe("Isomorphic health code", () => {
  // engine/ and importers/ run in client components as well as on the server,
  // so they may not reach the database, Next.js or Node — see docs/prd/health/gym.md.
  it("engine/ and importers/ import only their own files, gym-types, engine and @/lib/dates", () => {
    const allowed = (spec: string) =>
      spec.startsWith("./") ||
      spec === "../gym-types" ||
      spec.startsWith("../engine/") ||
      spec === "@/lib/dates";
    const offenders = sourceFiles
      .filter(({ file }) => /^src\/modules\/health\/(engine|importers)\//.test(file))
      .flatMap(({ file, text }) =>
        importsOf(text)
          .filter((spec) => !allowed(spec))
          .map((spec) => `${file} -> ${spec}`),
      );
    expect(offenders).toEqual([]);
  });
});
