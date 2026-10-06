import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";
import { decideRequest, isOriginAllowed, isOversizedAuthBody, wantsHsts } from "./edge-policy";

const pub = parseConfig({ APP_PUBLIC_ORIGIN: "https://life.example.com" });
const local = parseConfig({});
const base = {
  method: "GET",
  pathname: "/",
  host: "localhost:3000",
  origin: null,
  contentLength: null,
};

describe("decideRequest", () => {
  it("allows loopback and public hosts, refuses others", () => {
    expect(decideRequest(base, local).ok).toBe(true);
    expect(decideRequest({ ...base, host: "life.example.com" }, pub).ok).toBe(true);
    expect(decideRequest({ ...base, host: "life.example.com" }, local).ok).toBe(false);
    expect(decideRequest({ ...base, host: "evil.test:3000" }, pub).ok).toBe(false);
    expect(decideRequest({ ...base, host: null }, pub).ok).toBe(false);
  });

  it("requires an allowed Origin on writes", () => {
    const post = { ...base, method: "POST", pathname: "/login" };
    expect(decideRequest(post, local)).toMatchObject({ ok: false, status: 403 });
    expect(decideRequest({ ...post, origin: "null" }, local).ok).toBe(false);
    expect(decideRequest({ ...post, origin: "https://evil.test" }, pub).ok).toBe(false);
    expect(decideRequest({ ...post, origin: "http://localhost:3000" }, local).ok).toBe(true);
    expect(
      decideRequest({ ...post, host: "life.example.com", origin: "https://life.example.com" }, pub)
        .ok,
    ).toBe(true);
  });

  it("rejects oversized auth bodies with 413", () => {
    const post = { ...base, method: "POST", pathname: "/setup", origin: "http://127.0.0.1:3000" };
    expect(decideRequest({ ...post, contentLength: "65537" }, local)).toMatchObject({
      ok: false,
      status: 413,
    });
    expect(decideRequest({ ...post, contentLength: "100" }, local).ok).toBe(true);
  });
});

describe("helpers", () => {
  it("origin matching is exact", () => {
    expect(isOriginAllowed("http://life.example.com", pub)).toBe(false);
    expect(isOriginAllowed("http://localhost.evil.test", pub)).toBe(false);
    expect(isOriginAllowed("https://life.example.com/", pub)).toBe(false);
    expect(isOriginAllowed("http://[::1]:3000", local)).toBe(true);
  });
  it("body limit applies only to auth POSTs", () => {
    expect(isOversizedAuthBody("POST", "/finance", "999999")).toBe(false);
    expect(isOversizedAuthBody("POST", "/login/recover", "999999")).toBe(true);
    expect(isOversizedAuthBody("GET", "/login", "999999")).toBe(false);
    expect(isOversizedAuthBody("POST", "/login", "abc")).toBe(true);
  });
  it("HSTS only for https", () => {
    expect(wantsHsts(pub)).toBe(true);
    expect(wantsHsts(local)).toBe(false);
  });
});
