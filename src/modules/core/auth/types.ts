/**
 * Client-safe shapes for the public auth forms (login, recover, invite, setup,
 * claim). No server imports here.
 */
export interface AuthFormState {
  error?: string;
  /** Non-secret fields echoed back on failure (username only — never passwords). */
  values?: { username?: string };
  /** Shown exactly once after an account is created (invite/setup). The session
   * is already signed in with `recoveryKeyPending`; the page shows the key and a
   * button bound to `acknowledgeRecoveryKeyAction`. */
  recoveryKey?: string;
  /** Recovery step one passed: show the new-password fields (keep the key). */
  verified?: boolean;
}
