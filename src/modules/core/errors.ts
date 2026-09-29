/**
 * An expected, user-facing failure (a business rule said no). Services throw it;
 * the action wrapper shows its message verbatim. Anything else thrown is treated
 * as unexpected, logged, and replaced with a generic message.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/** Wrong passphrase or recovery key — detected by the AES-GCM auth tag. */
export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

/** The vault files are in a state the app refuses to act on (e.g. keyring
 * present but database missing). Message is safe to show the user. */
export class VaultStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultStateError";
  }
}

/** The database file could not be opened or migrated. Message is safe to show. */
export class DatabaseOpenError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseOpenError";
  }
}
