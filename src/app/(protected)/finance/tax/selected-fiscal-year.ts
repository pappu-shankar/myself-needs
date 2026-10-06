import {
  currentFiscalYear,
  listTaxFiscalYears,
  parseFiscalYearLabel,
  type FiscalYear,
} from "@/modules/finance";

/** The FY a tax page shows: `?fy=2024-25` when valid, otherwise the current FY. */
export function selectedFiscalYear(param: string | string[] | undefined): FiscalYear {
  return parseFiscalYearLabel(typeof param === "string" ? param : undefined) ?? currentFiscalYear();
}

/** FYs to offer in the picker (those with data or tax settings, plus the current one and the selected one), newest first. */
export function fiscalYearOptions(selected: FiscalYear): string[] {
  return [...new Set([...listTaxFiscalYears(), selected.label])].sort().reverse();
}
