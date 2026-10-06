import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/modules/core/errors";
import { mutualFundNavProvider } from "./mutual-fund-nav";

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mutualFundNavProvider", () => {
  it("fetches only the latest NAV for the scheme code, with a timeout signal", async () => {
    const fetchMock = stubFetch(async () =>
      Response.json({
        meta: { scheme_code: 119551 },
        data: [{ date: "26-10-2024", nav: "101.2345" }],
        status: "SUCCESS",
      }),
    );

    await expect(mutualFundNavProvider.fetchLatestPrice("119551")).resolves.toEqual({
      date: "2024-10-26",
      // Scaled by PRICE_SCALE (1e6) at the provider boundary, and the feed's
      // own currency stated rather than left for the caller to assume.
      priceScaled: 101_234_500,
      currency: "INR",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.mfapi.in/mf/119551/latest");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("never sends anything but a numeric scheme code", async () => {
    const fetchMock = stubFetch(async () => Response.json({}));
    await expect(mutualFundNavProvider.fetchLatestPrice("../mf?x=1")).rejects.toThrow(DomainError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no data", { data: [] }],
    ["non-numeric NAV", { data: [{ date: "26-10-2024", nav: "N.A." }] }],
    ["zero NAV", { data: [{ date: "26-10-2024", nav: "0" }] }],
    ["negative NAV", { data: [{ date: "26-10-2024", nav: "-5" }] }],
    ["malformed date", { data: [{ date: "2024-10-26", nav: "10" }] }],
    ["impossible date", { data: [{ date: "31-02-2024", nav: "10" }] }],
    ["wrong shape", { status: "FAIL" }],
  ])("rejects a malformed response (%s)", async (_label, body) => {
    stubFetch(async () => Response.json(body));
    await expect(mutualFundNavProvider.fetchLatestPrice("119551")).rejects.toThrow(
      "No valid NAV was returned for scheme code 119551.",
    );
  });

  it("rejects a non-JSON body", async () => {
    stubFetch(async () => new Response("<html>oops</html>", { status: 200 }));
    await expect(mutualFundNavProvider.fetchLatestPrice("119551")).rejects.toThrow(DomainError);
  });

  it("reports an HTTP error status", async () => {
    stubFetch(async () => new Response("down", { status: 503 }));
    await expect(mutualFundNavProvider.fetchLatestPrice("119551")).rejects.toThrow(
      "The NAV service returned an error (503). Try again later.",
    );
  });

  it("reports a timeout", async () => {
    stubFetch(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await expect(mutualFundNavProvider.fetchLatestPrice("119551")).rejects.toThrow(
      "The NAV service took too long to respond. Try again later.",
    );
  });

  it("reports a network failure", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(mutualFundNavProvider.fetchLatestPrice("119551")).rejects.toThrow(
      "Couldn't reach the NAV service",
    );
  });
});
