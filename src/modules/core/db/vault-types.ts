/**
 * Shared vocabulary for the multi-user vault layer. A vault is one SQLCipher
 * database with its own DEK and the full app schema — either a user's personal
 * vault or a shared space. See docs/architecture/multi-user-contracts.md.
 */

export type VaultRef = { kind: "user"; id: string } | { kind: "space"; id: string };

export type SpaceRole = "owner" | "editor" | "viewer";
export type AccountRole = "admin" | "member";

export interface RequestScope {
  userId: string;
  role: AccountRole;
  sessionId: string;
  /** What `getDb()` returns for this request. */
  vault: VaultRef;
  /** Set when `vault.kind === "space"`. */
  spaceRole: SpaceRole | null;
}

/** Stable pool/map key for a vault: `"user:<uuid>"` or `"space:<uuid>"`. */
export function vaultKey(ref: VaultRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function sameVault(a: VaultRef, b: VaultRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}
