"use server";

import { z } from "zod";
import { defineAdminAction } from "@/modules/core/action/define-action";
import {
  createInvite,
  deleteUser,
  revokeInvite,
  setUserRole,
  setUserStatus,
} from "./admin-service";

/**
 * Admin-only actions. `defineAdminAction` requires an admin session and runs
 * the handler with no vault scope, so none of these can read user data.
 */

const id = z.string().uuid("Unknown id");

/** `data.token` is the plaintext invite token — shown once, never stored. */
export const createInviteAction = defineAdminAction(
  z.object({
    note: z.string().max(200).optional(),
    ttlHours: z.coerce.number().int().min(1).max(336).optional(),
  }),
  ({ note, ttlHours }, scope) => createInvite(scope.userId, { note, ttlHours }),
  { name: "admin:create-invite" },
);

export const revokeInviteAction = defineAdminAction(
  z.object({ inviteId: id }),
  ({ inviteId }, scope) => revokeInvite(scope.userId, inviteId),
  { name: "admin:revoke-invite" },
);

export const setUserStatusAction = defineAdminAction(
  z.object({ userId: id, status: z.enum(["active", "disabled"]) }),
  ({ userId, status }, scope) => setUserStatus(scope.userId, userId, status),
  { name: "admin:set-user-status" },
);

export const setUserRoleAction = defineAdminAction(
  z.object({ userId: id, role: z.enum(["admin", "member"]) }),
  ({ userId, role }, scope) => setUserRole(scope.userId, userId, role),
  { name: "admin:set-user-role" },
);

export const deleteUserAction = defineAdminAction(
  z.object({ userId: id, confirmUsername: z.string().min(1, "Type the username to confirm") }),
  ({ userId, confirmUsername }, scope) => deleteUser(scope.userId, userId, confirmUsername),
  { name: "admin:delete-user", echoValues: false },
);
