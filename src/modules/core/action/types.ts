export type FieldErrors = Partial<Record<string, string[]>>;

/**
 * The one result shape every Server Action returns (and every `useActionState`
 * holds). Client-safe: no server imports here.
 *
 * - `ok` — the action succeeded; `data` carries its return value, if any.
 * - `error` — a message to show near the submit button. On validation failure it
 *   is the first problem found; `fieldErrors` has every problem, keyed by field.
 * - `values` — the submitted text values, echoed back on failure so a form can
 *   refill what React 19 reset after submission.
 */
export interface ActionState<T = undefined> {
  ok?: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
  data?: T;
}
