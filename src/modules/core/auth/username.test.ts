// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkUsername, normalizeUsername, parseUsername } from "./username";

describe("normalizeUsername", () => {
  it("applies NFKC, trims and lower-cases", () => {
    expect(normalizeUsername("  Alice ")).toBe("alice");
    // Full-width letters fold to ASCII under NFKC.
    expect(normalizeUsername("ＢＯＢ")).toBe("bob");
  });
});

describe("checkUsername", () => {
  it.each(["abc", "alice", "a.b-c_d", "0day", "x".repeat(32)])("accepts %s", (name) => {
    expect(checkUsername(name)).toEqual({ ok: true, username: name });
  });

  it("returns the normalized form", () => {
    expect(parseUsername("  Alice.Smith ")).toBe("alice.smith");
  });

  it.each([
    ["ab", "at least 3"],
    ["x".repeat(33), "at most 32"],
    [".alice", "start with a letter or a digit"],
    ["_alice", "start with a letter or a digit"],
    ["al ice", "only contain"],
    ["al@ice", "only contain"],
    ["élodie", "only contain"],
  ])("rejects %s", (name, message) => {
    const result = checkUsername(name);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(message);
    expect(parseUsername(name)).toBeNull();
  });
});
