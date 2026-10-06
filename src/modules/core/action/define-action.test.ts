// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { RequestScope } from "@/modules/core/db/vault-types";

const USER = "00000000-0000-4000-8000-000000000001";
function makeScope(overrides: Partial<RequestScope> = {}): RequestScope {
  return {
    userId: USER,
    role: "member",
    sessionId: "sid-1",
    vault: { kind: "user", id: USER },
    spaceRole: null,
    ...overrides,
  };
}

const requireUnlocked = vi.fn(async () => makeScope());
const requireAdminForAction = vi.fn(async () => makeScope({ role: "admin" }));
const revalidatePath = vi.fn();

vi.mock("@/modules/core/session/guard", () => ({
  requireUserForAction: requireUnlocked,
  requireAdminForAction,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

const {
  defineAction,
  defineAdminAction,
  defineFormAction,
  formDataToObject,
  VIEWER_READ_ONLY_MESSAGE,
} = await import("./define-action");
const { DomainError } = await import("@/modules/core/errors");
const { currentScope } = await import("@/modules/core/db/request-scope");

function form(entries: [string, string | Blob][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

beforeEach(() => {
  requireUnlocked.mockClear();
  requireUnlocked.mockImplementation(async () => makeScope());
  requireAdminForAction.mockClear();
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

describe("request scope and space roles", () => {
  const space = { kind: "space", id: "00000000-0000-4000-8000-0000000000aa" } as const;

  it("runs the handler inside the caller's request scope and passes it in", async () => {
    let seen: RequestScope | undefined;
    let arg: RequestScope | undefined;
    const action = defineAction(z.object({}), (_input, scope) => {
      seen = currentScope();
      arg = scope;
    });
    await action({});
    expect(seen?.userId).toBe(USER);
    expect(arg?.sessionId).toBe("sid-1");
    expect(currentScope()).toBeUndefined();
  });

  it("refuses writes from a space viewer without running the handler", async () => {
    requireUnlocked.mockImplementation(async () =>
      makeScope({ vault: space, spaceRole: "viewer" }),
    );
    const handler = vi.fn();
    const formAction = defineFormAction(schema, handler);
    const state = await formAction(
      {},
      form([
        ["name", "Rent"],
        ["amount", "1"],
      ]),
    );
    expect(state.error).toBe(VIEWER_READ_ONLY_MESSAGE);
    expect(state.values).toEqual({ name: "Rent", amount: "1" });
    expect((await defineAction(z.object({}), handler)({})).error).toBe(VIEWER_READ_ONLY_MESSAGE);
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets viewers run read-only actions and editors write", async () => {
    requireUnlocked.mockImplementation(async () =>
      makeScope({ vault: space, spaceRole: "viewer" }),
    );
    expect(await defineAction(z.object({}), () => 1, { readOnly: true })({})).toEqual({
      ok: true,
      data: 1,
    });
    requireUnlocked.mockImplementation(async () =>
      makeScope({ vault: space, spaceRole: "editor" }),
    );
    expect(await defineAction(z.object({}), () => 2)({})).toEqual({ ok: true, data: 2 });
  });
});

describe("defineAdminAction", () => {
  it("requires an admin and runs with no vault scope", async () => {
    let seen: RequestScope | undefined = makeScope();
    let actor: RequestScope | undefined;
    const action = defineAdminAction(z.object({ id: z.string() }), (_input, scope) => {
      seen = currentScope();
      actor = scope;
      return "done";
    });
    expect(await action({}, form([["id", "x"]]))).toEqual({ ok: true, data: "done" });
    expect(requireAdminForAction).toHaveBeenCalledOnce();
    expect(requireUnlocked).not.toHaveBeenCalled();
    expect(seen).toBeUndefined();
    expect(actor?.role).toBe("admin");
  });

  it("stops at the admin guard", async () => {
    requireAdminForAction.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const handler = vi.fn();
    await expect(defineAdminAction(z.object({}), handler)({}, form([]))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
