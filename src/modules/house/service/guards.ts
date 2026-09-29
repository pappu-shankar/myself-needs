import { DomainError } from "@/modules/core/errors";

export function requireUpdated<T>(row: T | undefined, entity: string): T {
  if (!row) throw new DomainError(`The ${entity} no longer exists.`);
  return row;
}
