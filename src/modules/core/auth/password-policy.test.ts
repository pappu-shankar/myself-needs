// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkPassword, isCommonPassword } from "./password-policy";

describe("checkPassword", () => {
  it("accepts a long, uncommon passphrase", () => {
    expect(checkPassword("violet harbor lantern 42")).toEqual({ ok: true });
  });

  it("rejects passwords under 12 characters", () => {
    const result = checkPassword("short1!");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at least 12/);
  });

  it("counts code points, not UTF-16 units", () => {
    // 6 emoji = 12 UTF-16 units but only 6 characters.
    expect("🔒".repeat(6)).toHaveLength(12);
    expect(checkPassword("🔒".repeat(6)).ok).toBe(false);
    expect(checkPassword("пароль-мой-секрет").ok).toBe(true);
  });

  it("rejects passwords over 256 characters", () => {
    const result = checkPassword("a".repeat(100) + "b".repeat(157));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at most 256/);
    expect(checkPassword("q7".repeat(128)).ok).toBe(true);
  });

  it("rejects common passwords case-insensitively", () => {
    expect(isCommonPassword("passwordpassword")).toBe(true);
    expect(isCommonPassword("PasswordPassword")).toBe(true);
    const result = checkPassword("Qwerty123456");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/too common/);
  });

  it("rejects a password equal to the username", () => {
    const result = checkPassword("Alice.Wonderland", { username: "alice.wonderland" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/same as your username/);
    expect(checkPassword("alice.wonderland!", { username: "alice.wonderland" }).ok).toBe(true);
  });
});
