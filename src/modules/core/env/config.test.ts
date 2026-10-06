import { afterEach, describe, expect, it } from "vitest";
import { getConfig, parseConfig, resetConfigForTests } from "./config";

describe("parseConfig", () => {
  it("defaults to loopback-only", () => {
    const c = parseConfig({});
    expect(c.publicOrigin).toBeNull();
    expect([...c.allowedHosts].sort()).toEqual(["127.0.0.1", "[::1]", "localhost"]);
    expect(c).toMatchObject({
      trustProxy: false,
      setupToken: null,
      idleLockMinutes: 30,
      sessionMaxHours: 12,
      maxOpenVaults: 50,
      profilePicker: false,
      secureCookies: false,
    });
  });

  it("derives hosts and secure cookies from an https public origin", () => {
    const c = parseConfig({
      APP_PUBLIC_ORIGIN: "https://Life.Example.com",
      APP_ALLOWED_HOSTS: "a.test, b.test",
    });
    expect(c.allowedHosts.has("life.example.com")).toBe(true);
    expect(c.allowedHosts.has("a.test") && c.allowedHosts.has("b.test")).toBe(true);
    expect(c.secureCookies).toBe(true);
  });

  it("allows APP_SECURE_COOKIES with http origin", () => {
    expect(parseConfig({ APP_SECURE_COOKIES: "1" }).secureCookies).toBe(true);
    expect(parseConfig({ APP_PUBLIC_ORIGIN: "http://x.test" }).secureCookies).toBe(false);
  });

  it.each([
    [{ APP_PUBLIC_ORIGIN: "not a url" }, /APP_PUBLIC_ORIGIN/],
    [{ APP_PUBLIC_ORIGIN: "ftp://x.test" }, /http/],
    [{ APP_PUBLIC_ORIGIN: "https://x.test/path" }, /origin only/],
    [{ APP_ALLOWED_HOSTS: "https://x.test" }, /APP_ALLOWED_HOSTS/],
    [{ APP_SETUP_TOKEN: "short" }, /16 characters/],
    [{ APP_IDLE_LOCK_MINUTES: "abc" }, /whole number/],
    [{ APP_SESSION_MAX_HOURS: "0" }, /between/],
    [{ APP_TRUST_PROXY: "maybe" }, /APP_TRUST_PROXY/],
  ])("rejects %j", (env, message) => {
    expect(() => parseConfig(env)).toThrow(message);
  });
});

describe("getConfig", () => {
  afterEach(() => {
    delete process.env.APP_MAX_OPEN_VAULTS;
    resetConfigForTests();
  });

  it("caches until reset", () => {
    process.env.APP_MAX_OPEN_VAULTS = "7";
    resetConfigForTests();
    expect(getConfig().maxOpenVaults).toBe(7);
    process.env.APP_MAX_OPEN_VAULTS = "9";
    expect(getConfig().maxOpenVaults).toBe(7);
    resetConfigForTests();
    expect(getConfig().maxOpenVaults).toBe(9);
  });
});
