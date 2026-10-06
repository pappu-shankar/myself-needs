/**
 * A form-level error summary for the auth forms. Credential errors are
 * deliberately generic (no "which field was wrong"), so they belong to the
 * whole form rather than to one input. Rendered empty when there is no error
 * so the live region already exists when the message arrives.
 */
export function FormError({ message, id }: { message?: string; id?: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm empty:hidden"
    >
      {message ?? ""}
    </p>
  );
}
