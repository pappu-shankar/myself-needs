import { getTaxSettings, updateTaxSettings } from "../../db/queries/config/tax-settings";
import { listTaxSlabs, insertTaxSlab, updateTaxSlabRate } from "../../db/queries/config/tax-slabs";

export function getTaxSettingsView() {
  return getTaxSettings();
}

export function setTaxSettings(patch: Partial<Parameters<typeof updateTaxSettings>[0]>) {
  return updateTaxSettings(patch);
}

export function getTaxSlabsView(regime: "old" | "new") {
  return listTaxSlabs(regime);
}

export function addTaxSlab(regime: "old" | "new", uptoAmount: number | null, ratePercent: number) {
  return insertTaxSlab({ regime, uptoAmount, ratePercent });
}

export function editTaxSlabRate(id: number, ratePercent: number) {
  return updateTaxSlabRate(id, ratePercent);
}
