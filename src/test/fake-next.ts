/**
 * Stand-ins for `next/headers`, `next/navigation` and `next/cache` in tests
 * that drive real Server Actions. Each "browser" has its own cookie jar and
 * headers; `switchBrowser("a")` switches which one the next action sees.
 *
 *   vi.mock("next/headers", async () => (await import("@/test/fake-next")).nextHeaders);
 *   vi.mock("next/navigation", async () => (await import("@/test/fake-next")).nextNavigation);
 *   vi.mock("next/cache", async () => (await import("@/test/fake-next")).nextCache);
 */

export class RedirectSignal extends Error {
  constructor(readonly path: string) {
    super(`REDIRECT:${path}`);
    this.name = "RedirectSignal";
  }
}

interface Browser {
  cookies: Map<string, string>;
  headers: Record<string, string>;
}

const browsers = new Map<string, Browser>();
let current = "default";

function browser(): Browser {
  let b = browsers.get(current);
  if (!b) {
    b = { cookies: new Map(), headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120.0" } };
    browsers.set(current, b);
  }
  return b;
}

/** Switches the active browser (created on first use). */
export function switchBrowser(name: string, headers?: Record<string, string>): void {
  current = name;
  if (headers) browser().headers = { ...browser().headers, ...headers };
  else browser();
}

export function resetBrowsers(): void {
  browsers.clear();
  current = "default";
}

export function browserCookies(name = current): Map<string, string> {
  const saved = current;
  current = name;
  const jar = browser().cookies;
  current = saved;
  return jar;
}

type CookieInput = string | { name: string; value: string; maxAge?: number };

const cookieStore = {
  get(name: string) {
    const value = browser().cookies.get(name);
    return value === undefined ? undefined : { name, value };
  },
  getAll() {
    return [...browser().cookies].map(([name, value]) => ({ name, value }));
  },
  has(name: string) {
    return browser().cookies.has(name);
  },
  set(nameOrCookie: CookieInput, value?: string, options?: { maxAge?: number }) {
    const name = typeof nameOrCookie === "string" ? nameOrCookie : nameOrCookie.name;
    const val = typeof nameOrCookie === "string" ? (value ?? "") : nameOrCookie.value;
    const maxAge = typeof nameOrCookie === "string" ? options?.maxAge : nameOrCookie.maxAge;
    if (maxAge === 0 || val === "") browser().cookies.delete(name);
    else browser().cookies.set(name, val);
  },
  delete(name: string) {
    browser().cookies.delete(name);
  },
};

export const nextHeaders = {
  cookies: async () => cookieStore,
  headers: async () => new Headers(browser().headers),
};

export const nextNavigation = {
  redirect: (path: string): never => {
    throw new RedirectSignal(path);
  },
  unstable_rethrow: (err: unknown) => {
    if (err instanceof RedirectSignal) throw err;
  },
  notFound: (): never => {
    throw new Error("NOT_FOUND");
  },
};

export const nextCache = {
  revalidatePath: () => {},
  revalidateTag: () => {},
};

/** Awaits `promise`, expecting it to redirect to `path`. */
export async function expectRedirect(promise: Promise<unknown>, path: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RedirectSignal) {
      if (err.path !== path) throw new Error(`Expected redirect to ${path}, got ${err.path}`);
      return;
    }
    throw err;
  }
  throw new Error(`Expected redirect to ${path}, but it resolved`);
}
