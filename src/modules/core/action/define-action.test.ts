// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const requireUnlocked = vi.fn(async () => {});
const revalidatePath = vi.fn();

vi.mock("@/modules/core/session/guard", () => ({ requireUnlocked }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { defineAction, defineFormAction, formDataToObject } = await import("./define-action");
const { DomainError } = await import("@/modules/core/errors");

function form(entries: [string, string | Blob][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

beforeEach(() => {
  requireUnlocked.mockClear();
  revalidatePath.mockClear();
});

describe("formDataToObject", () => {
  it("turns blanks into undefined, repeats into arrays, and skips React's internal fields", () => {
    const result = formDataToObject(
      form([
        ["name", "Salary"],
        ["note", "   "],
        ["tag", "a"],
        ["tag", "b"],
        ["$ACTION_ID_abc", ""],
        ["photo", new File([], "")],
      ]),
    );
    expect(result).toEqual({ name: "Salary", note: undefined, tag: ["a", "b"], photo: undefined });
  });
});

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.coerce.number().positive("Must be positive"),
});

describe("defineFormAction", () => {
  it("requires an unlocked vault before doing anything", async () => {
    const handler = vi.fn();
    requireUnlocked.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const action = defineFormAction(schema, handler);

    await expect(action({}, form([["name", "x"]]))).rejects.toThrow("NEXT_REDIRECT");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns every field error plus the submitted values when validation fails", async () => {
    const handler = vi.fn();
    const action = defineFormAction(schema, handler);

    const state = await action({}, form([["amount", "-5"]]));

    expect(handler).not.toHaveBeenCalled();
    expect(state.ok).toBeUndefined();
    expect(state.fieldErrors?.name?.[0]).toBeDefined();
    expect(state.fieldErrors?.amount).toEqual(["Must be positive"]);
    expect(state.error).toBeTruthy();
    expect(state.values).toEqual({ amount: "-5" });
  });

  it("returns ok with the handler's data and refreshes the app", async () => {
    const action = defineFormAction(schema, ({ name, amount }) => ({
      id: 7,
      label: `${name}:${amount}`,
    }));

    const state = await action(
      {},
      form([
        ["name", "Rent"],
        ["amount", "1200"],
      ]),
    );

    expect(state).toEqual({ ok: true, data: { id: 7, label: "Rent:1200" } });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("can skip the refresh for read-only actions", async () => {
    const action = defineFormAction(schema, () => undefined, { revalidate: false });
    await action(
      {},
      form([
        ["name", "Rent"],
        ["amount", "1"],
      ]),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("shows a DomainError's message verbatim", async () => {
    const action = defineFormAction(schema, () => {
      throw new DomainError("Budget already exists for this month");
    });
    const state = await action(
      {},
      form([
        ["name", "Rent"],
        ["amount", "1"],
      ]),
    );
    expect(state.error).toBe("Budget already exists for this month");
    expect(state.values).toEqual({ name: "Rent", amount: "1" });
  });

  it("maps SQLite constraint failures (even when wrapped) to friendly messages", async () => {
    const sqliteError = Object.assign(new Error("UNIQUE constraint failed: budgets.category_id"), {
      code: "SQLITE_CONSTRAINT_UNIQUE",
    });
    const action = defineFormAction(schema, () => {
      throw new Error("Failed query", { cause: sqliteError });
    });
    const state = await action(
      {},
      form([
        ["name", "Rent"],
        ["amount", "1"],
      ]),
    );
    expect(state.error).toBe("That already exists.");
  });

  it("hides unexpected errors behind a generic message and never logs query params", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const queryError = Object.assign(new Error("Failed query: insert ...\nparams: 4500,Salary"), {
      query: "insert into transactions ...",
      params: [4500, "Salary"],
    });
    const action = defineFormAction(schema, () => {
      throw queryError;
    });

    const state = await action(
      {},
      form([
        ["name", "Rent"],
        ["amount", "1"],
      ]),
    );

    expect(state.error).toMatch(/Something went wrong/);
    const logged = consoleError.mock.calls.flat().join("\n");
    expect(logged).toContain("params redacted");
    expect(logged).not.toContain("4500");
    expect(logged).not.toContain("Salary");
    consoleError.mockRestore();
  });

  it("never echoes values back when told not to (e.g. passphrases)", async () => {
    const action = defineFormAction(z.object({ secret: z.string().min(12) }), () => undefined, {
      echoValues: false,
    });
    const state = await action({}, form([["secret", "short"]]));
    expect(state.values).toBeUndefined();
  });
});

describe("defineAction", () => {
  it("validates a plain object input with the same guarantees", async () => {
    const action = defineAction(z.object({ id: z.number().int().positive() }), ({ id }) => id * 2);

    expect(await action({ id: 21 })).toEqual({ ok: true, data: 42 });
    expect((await action({ id: -1 })).fieldErrors?.id).toBeDefined();
    expect(requireUnlocked).toHaveBeenCalledTimes(2);
  });
});
