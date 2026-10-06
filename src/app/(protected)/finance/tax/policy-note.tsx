import Link from "next/link";

/** Says which FY's tax settings a figure used when the selected FY has none of its own. */
export function PolicyNote({
  fiscalYear,
  policyFiscalYear,
}: {
  fiscalYear: string;
  policyFiscalYear: string;
}) {
  if (fiscalYear === policyFiscalYear) return null;
  return (
    <p className="text-muted-foreground mb-4 text-sm">
      FY {fiscalYear} has no tax settings of its own yet, so FY {policyFiscalYear}&apos;s limits and
      rates are used.{" "}
      <Link href={`/finance/settings?fy=${fiscalYear}`} className="underline underline-offset-4">
        Start FY {fiscalYear} in Settings
      </Link>{" "}
      to set its own.
    </p>
  );
}
