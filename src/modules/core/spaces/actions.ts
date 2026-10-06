"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import { DomainError } from "@/modules/core/errors";
import { SPACE_MODULES } from "@/modules/core/auth/spaces-store";
import * as spaces from "./spaces-service";

/**
 * Space management. These change the registry (membership, keys), not the
 * space's records, so they are `readOnly` for the viewer check; owner checks
 * happen in spaces-service.
 */

const id = z.string().uuid("Unknown space");
const role = z.enum(["owner", "editor", "viewer"]);
const modules = z
  .union([z.enum(SPACE_MODULES), z.array(z.enum(SPACE_MODULES))])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));

export const createSpaceAction = defineFormAction(
  z.object({ name: z.string({ error: "Give the space a name" }).min(1).max(60), modules }),
  ({ name, modules }, scope) => {
    const space = spaces.createSpace(scope, name, modules);
    return { id: space.id };
  },
  { name: "spaces:create", readOnly: true },
);

/** `{ kind: "user" }` returns to the personal vault; `{ kind: "space", id }` opens a space. */
export const switchVaultAction = defineAction(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("user") }),
    z.object({ kind: z.literal("space"), id }),
  ]),
  (target, scope) =>
    spaces.switchVault(
      scope,
      target.kind === "user"
        ? { kind: "user", id: scope.userId }
        : { kind: "space", id: target.id },
    ),
  { name: "spaces:switch", readOnly: true },
);

export const inviteMemberAction = defineFormAction(
  z.object({ spaceId: id, username: z.string().min(1, "Enter a username"), role }),
  ({ spaceId, username, role }, scope) => {
    spaces.inviteMember(scope, spaceId, username, role);
  },
  { name: "spaces:invite-member", readOnly: true },
);

export const setMemberRoleAction = defineFormAction(
  z.object({ spaceId: id, userId: z.string().uuid(), role }),
  ({ spaceId, userId, role }, scope) => spaces.setMemberRole(scope, spaceId, userId, role),
  { name: "spaces:set-member-role", readOnly: true },
);

export const removeMemberAction = defineFormAction(
  z.object({ spaceId: id, userId: z.string().uuid() }),
  ({ spaceId, userId }, scope) => spaces.removeMember(scope, spaceId, userId),
  { name: "spaces:remove-member", readOnly: true },
);

/**
 * Leaving or deleting a space makes its page inaccessible, so these don't use
 * define-action's post-success revalidation (that would re-render the page the
 * user is on — the space's own page — and flash an error before navigating).
 * They revalidate, then redirect to the spaces list in the same response.
 */
function leaveToSpacesList(): void {
  revalidatePath("/", "layout");
  redirect("/spaces");
}

export const leaveSpaceAction = defineFormAction(
  z.object({ spaceId: id }),
  ({ spaceId }, scope) => {
    spaces.leaveSpace(scope, spaceId);
    leaveToSpacesList();
  },
  { name: "spaces:leave", readOnly: true, revalidate: false },
);

export const deleteSpaceAction = defineFormAction(
  z.object({ spaceId: id, confirmName: z.string().min(1, "Type the space's name to confirm") }),
  ({ spaceId, confirmName }, scope) => {
    const space = spaces.listMySpaces(scope.userId).find((s) => s.id === spaceId);
    if (!space || space.name !== confirmName.trim()) {
      throw new DomainError("Type the space's name exactly to confirm.");
    }
    spaces.deleteSpace(scope, spaceId);
    leaveToSpacesList();
  },
  { name: "spaces:delete", readOnly: true, revalidate: false },
);

export const renameSpaceAction = defineFormAction(
  z.object({ spaceId: id, name: z.string().min(1).max(60) }),
  ({ spaceId, name }, scope) => spaces.renameSpace(scope, spaceId, name),
  { name: "spaces:rename", readOnly: true },
);

export const setSpaceModulesAction = defineFormAction(
  z.object({ spaceId: id, modules }),
  ({ spaceId, modules }, scope) => {
    spaces.setSpaceModules(scope, spaceId, modules);
  },
  { name: "spaces:set-modules", readOnly: true },
);
