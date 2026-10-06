import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { CredentialError, DomainError, VaultStateError } from "@/modules/core/errors";
import { runWithScope } from "@/modules/core/db/request-scope";
import type { RequestScope } from "@/modules/core/db/vault-types";
import { logError } from "@/modules/core/log";
import { requireAdminForAction, requireUserForAction } from "@/modules/core/session/guard";
import type { ActionState, FieldErrors } from "@/modules/core/action/types";

interface ActionOptions {
  /** Echo submitted text values back on failure (default true). Turn off for
   * secrets such as passphrases. */
  echoValues?: boolean;
  /** Log label; defaults to "action". */
  name?: string;
  /** Refresh every page after success (default true). Turn off for read-only
   * actions such as search. */
  revalidate?: boolean;
  /** The action doesn't write to the current vault (search, export, account
   * settings), so it is allowed for a space's viewers. Default false: every
   * other action is refused while the session is looking at a space as a viewer. */
  readOnly?: boolean;
}

export const VIEWER_READ_ONLY_MESSAGE =
  "You have view-only access to this space, so you can't make changes here.";

/**
 * Turns FormData into a plain object for Zod: blank strings become `undefined`
 * (so `.optional()` works for empty inputs), a key sent more than once becomes an
 * array, empty file inputs are dropped, and React's internal `$ACTION_*` fields
 * are skipped.
 */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = formData
      .getAll(key)
      .map((value) =>
        typeof value === "string"
          ? value.trim() === ""
            ? undefined
            : value
          : value.size === 0
            ? undefined
            : value,
      )
      .filter((value) => value !== undefined);
    result[key] = values.length > 1 ? values : values[0];
  }
  return result;
}

function echoTextValues(raw: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

function validationFailure(
  error: z.ZodError,
  values: Record<string, string> | undefined,
): ActionState<never> {
  const { formErrors, fieldErrors } = z.flattenError(error);
  const firstFieldError = Object.values(fieldErrors as FieldErrors).find(
    (messages) => messages?.length,
  )?.[0];
  return {
    error: formErrors[0] ?? firstFieldError ?? "Please check the form and try again.",
    fieldErrors: fieldErrors as FieldErrors,
    values,
  };
}

const SQLITE_MESSAGES: Record<string, string> = {
  SQLITE_CONSTRAINT_UNIQUE: "That already exists.",
  SQLITE_CONSTRAINT_PRIMARYKEY: "That already exists.",
  SQLITE_CONSTRAINT_FOREIGNKEY:
    "This is still linked to other records, or refers to something that no longer exists.",
  SQLITE_CONSTRAINT_NOTNULL: "Some required information is missing.",
  SQLITE_CONSTRAINT_CHECK: "One of the values isn't allowed.",
  SQLITE_BUSY: "The database is busy — please try again in a moment.",
};

function sqliteCode(err: unknown): string | undefined {
  for (let current = err; current instanceof Error; current = current.cause) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code.startsWith("SQLITE_")) return code;
  }
  return undefined;
}

/** Maps a thrown error to a message that's safe and useful to show. */
export function toUserMessage(err: unknown, scope: string): string {
  if (
    err instanceof DomainError ||
    err instanceof CredentialError ||
    err instanceof VaultStateError
  ) {
    return err.message;
  }
  const code = sqliteCode(err);
  if (code && SQLITE_MESSAGES[code]) return SQLITE_MESSAGES[code];
  logError(scope, err);
  return "Something went wrong and the change wasn't saved. Please try again.";
}

type Handler<TInput, TResult> = (input: TInput, scope: RequestScope) => TResult | Promise<TResult>;

type LegacyFormHandler<TState> = (
  previousState: TState,
  formData: FormData,
) => TState | Promise<TState>;

async function run<TSchema extends z.ZodType, TResult>(
  schema: TSchema,
  handler: Handler<z.output<TSchema>, TResult>,
  raw: unknown,
  values: Record<string, string> | undefined,
  options: ActionOptions,
  scope: RequestScope,
): Promise<ActionState<Awaited<TResult>>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return validationFailure(parsed.error, values);
  try {
    const data = await handler(parsed.data, scope);
    // Single-user app with fully dynamic pages: refreshing everything after a
    // write is cheap and means no module has to know which URLs show its data.
    if (options.revalidate !== false) revalidatePath("/", "layout");
    return data === undefined ? { ok: true } : { ok: true, data };
  } catch (err) {
    unstable_rethrow(err);
    return { error: toUserMessage(err, options.name ?? "action"), values };
  }
}

/** Signed-in user, refused (as an ActionState) when a viewer tries to write. */
async function authorize(
  options: ActionOptions,
): Promise<{ scope: RequestScope; denied?: ActionState<never> }> {
  const scope = await requireUserForAction();
  if (scope.spaceRole === "viewer" && !options.readOnly) {
    return { scope, denied: { error: VIEWER_READ_ONLY_MESSAGE } };
  }
  return { scope };
}

/**
 * Wraps a form-submitted Server Action: requires a signed-in user (and runs the
 * handler inside their request scope, so `getDb()` is their current vault), refuses
 * writes from a space viewer, validates the
 * FormData with `schema`, runs `handler`, refreshes the app on success, and turns
 * any failure into an `ActionState` instead of a crash. Use as
 * `export const addThingAction = defineFormAction(schema, (input) => ...)` and
 * pass it to `useActionState`.
 */
export function defineFormAction<TState>(
  handler: LegacyFormHandler<TState>,
): LegacyFormHandler<TState>;
export function defineFormAction<TSchema extends z.ZodType, TResult = void>(
  schema: TSchema,
  handler: Handler<z.output<TSchema>, TResult>,
  options?: ActionOptions,
): (
  previousState: ActionState<Awaited<TResult>>,
  formData: FormData,
) => Promise<ActionState<Awaited<TResult>>>;
export function defineFormAction<TState, TSchema extends z.ZodType, TResult = void>(
  schema: TSchema | LegacyFormHandler<TState>,
  handler?: Handler<z.output<TSchema>, TResult>,
  options: ActionOptions = {},
) {
  if (typeof schema === "function") {
    return async (previousState: TState, formData: FormData): Promise<TState> => {
      const { scope, denied } = await authorize({});
      if (denied) return denied as TState;
      return runWithScope(scope, () => schema(previousState, formData));
    };
  }

  return async function formAction(
    _prevState: ActionState<Awaited<TResult>>,
    formData: FormData,
  ): Promise<ActionState<Awaited<TResult>>> {
    const raw = formDataToObject(formData);
    const values = options.echoValues === false ? undefined : echoTextValues(raw);
    const { scope, denied } = await authorize(options);
    if (denied) return { ...denied, values };
    return runWithScope(scope, () => run(schema, handler!, raw, values, options, scope));
  };
}

/**
 * Same guarantees as `defineFormAction`, for actions called programmatically with
 * a plain object (drag-and-drop saves, search, toggles) rather than a form.
 */
export function defineAction<TSchema extends z.ZodType, TResult = void>(
  schema: TSchema,
  handler: Handler<z.output<TSchema>, TResult>,
  options: Omit<ActionOptions, "echoValues"> = {},
) {
  return async function action(input: z.input<TSchema>): Promise<ActionState<Awaited<TResult>>> {
    const { scope, denied } = await authorize(options);
    if (denied) return denied;
    return runWithScope(scope, () => run(schema, handler, input, undefined, options, scope));
  };
}

/**
 * Admin-only form action. Requires an admin session and runs the handler with
 * NO request scope — `getDb()` throws inside it, so an admin action can never
 * read or write anyone's vault (including the admin's own). The handler gets
 * the admin's scope as its second argument, for auditing.
 */
export function defineAdminAction<TSchema extends z.ZodType, TResult = void>(
  schema: TSchema,
  handler: Handler<z.output<TSchema>, TResult>,
  options: Omit<ActionOptions, "readOnly"> = {},
) {
  return async function adminAction(
    _prevState: ActionState<Awaited<TResult>>,
    formData: FormData,
  ): Promise<ActionState<Awaited<TResult>>> {
    const scope = await requireAdminForAction();
    const raw = formDataToObject(formData);
    const values = options.echoValues === false ? undefined : echoTextValues(raw);
    return run(schema, handler, raw, values, options, scope);
  };
}
