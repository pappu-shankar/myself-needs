import type { SpaceModule, SpaceRole } from "@/modules/core/auth/spaces-store";

export const MODULE_LABELS: Record<SpaceModule, string> = {
  finance: "Finance",
  health: "Health",
  mental: "Mental",
  plans: "Plans",
  house: "House",
  fashion: "Fashion",
};

export const ROLE_LABELS: Record<SpaceRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<SpaceRole, string> = {
  owner: "Owner — can edit, invite and remove people, and delete the space",
  editor: "Editor — can add and change records",
  viewer: "Viewer — can look, but not change anything",
};

export function moduleList(modules: readonly SpaceModule[]): string {
  return modules.length === 0 ? "No modules" : modules.map((m) => MODULE_LABELS[m]).join(", ");
}
