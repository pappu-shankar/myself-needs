import "server-only";
import { closeVault } from "@/modules/core/db/client";
import { endUserSessions } from "@/modules/core/session/session-registry";
import { removeUserFromAllSpaces, trashVaultDir } from "@/modules/core/spaces/spaces-service";
import { deleteAccount, findById } from "./accounts-store";
import { recordAudit } from "./audit-store";
import { deleteAvatar } from "./avatar";

/**
 * Removes an account and everything that is only theirs. Shared by "delete my
 * account" and the admin's delete. Order matters: spaces first (re-keying them
 * may use the leaving user's cached key), then sessions and the open vault,
 * then the registry row, then the vault directory (renamed to `.trash-` before
 * removal). The caller has already done every permission/last-admin check.
 */
export function deleteAccountCompletely(userId: string, actorId: string | null): void {
  const account = findById(userId);
  if (!account) return;
  removeUserFromAllSpaces(userId, actorId);
  endUserSessions(userId, { reason: "deleted" });
  closeVault({ kind: "user", id: userId });
  deleteAccount(userId);
  trashVaultDir("users", userId);
  deleteAvatar(userId);
  recordAudit({
    event: "account.deleted",
    userId,
    actorId,
    detail: { targetUserId: userId, role: account.role },
  });
}
