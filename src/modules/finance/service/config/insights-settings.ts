import {
  getInsightsSettings,
  updateInsightsSettings,
} from "../../db/queries/config/insights-settings";

export function getInsightsSettingsView() {
  return getInsightsSettings();
}

export function setInsightsSettings(patch: Parameters<typeof updateInsightsSettings>[0]) {
  return updateInsightsSettings(patch);
}
