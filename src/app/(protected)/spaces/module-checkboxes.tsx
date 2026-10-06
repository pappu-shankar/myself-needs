import type { SpaceModule } from "@/modules/core/auth/spaces-store";
import { MODULE_LABELS } from "./space-labels";

/** One `modules` checkbox per space module, as a labelled fieldset. */
export function ModuleCheckboxes({
  modules,
  defaultChecked,
  legend = "Modules",
  idPrefix,
}: {
  modules: readonly SpaceModule[];
  defaultChecked: readonly SpaceModule[];
  legend?: string;
  idPrefix: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {modules.map((module) => {
          const id = `${idPrefix}-${module}`;
          return (
            <label key={module} htmlFor={id} className="flex items-center gap-2 text-sm">
              <input
                id={id}
                type="checkbox"
                name="modules"
                value={module}
                defaultChecked={defaultChecked.includes(module)}
                className="accent-primary size-4"
              />
              {MODULE_LABELS[module]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
