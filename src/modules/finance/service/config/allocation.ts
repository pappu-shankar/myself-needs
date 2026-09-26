import { upsertAllocationTarget } from "../../db/queries/config/allocation-targets";
import {
  getSettings,
  upsertSettings,
  dismissGettingStarted,
} from "../../db/queries/config/settings";

type CoarseClass = "equity" | "debt" | "gold" | "cash";

export function setAllocationTarget(assetClass: CoarseClass, targetPercentage: number) {
  return upsertAllocationTarget(assetClass, targetPercentage);
}

export function getFinanceSettings() {
  return getSettings();
}

export function setDateOfBirth(dateOfBirth: string | null) {
  return upsertSettings(dateOfBirth);
}

export function dismissGettingStartedChecklist() {
  return dismissGettingStarted();
}
