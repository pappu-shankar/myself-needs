/**
 * Server-side logging. Only error names, messages and stacks are written — never
 * action inputs, query parameters or row data, since those hold the user's
 * personal records. Output goes to the terminal running the app, nowhere else.
 */
export function logError(scope: string, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error(`[${new Date().toISOString()}] [${scope}] ${describe(error)}`);
  const root = rootCause(error);
  if (process.env.NODE_ENV !== "production" && root.stack && !hasQueryParams(root)) {
    console.error(root.stack);
  }
}

export type AuditEvent =
  | "vault.created"
  | "vault.unlock.failed"
  | "vault.unlock.throttled"
  | "vault.unlocked"
  | "vault.locked"
  | "vault.recovery.verified"
  | "vault.recovery.failed"
  | "vault.recovery.reset"
  | "vault.recovery.reset.failed";

/** Audit events contain only lifecycle metadata, never credentials or records. */
export function logAudit(event: AuditEvent): void {
  console.info(JSON.stringify({ at: new Date().toISOString(), event }));
}

/** Drizzle's query errors embed the bound parameters (the user's data) in their
 * message, so for those only the SQL and the underlying driver error are kept. */
function hasQueryParams(error: Error): error is Error & { query: string } {
  return "params" in error && "query" in error;
}

function describe(error: Error): string {
  const own = hasQueryParams(error)
    ? `${error.name}: failed query \`${error.query}\` (params redacted)`
    : `${error.name}: ${error.message}`;
  return error.cause instanceof Error ? `${own} <- ${describe(error.cause)}` : own;
}

function rootCause(error: Error): Error {
  return error.cause instanceof Error ? rootCause(error.cause) : error;
}
