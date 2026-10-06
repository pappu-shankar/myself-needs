import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { getSchemeTemplates } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AddSchemeTemplateDialog } from "./add-scheme-template-dialog";

export const metadata: Metadata = {
  title: "Scheme templates — Investments — Personal Life OS",
};

export default async function SchemeTemplatesPage() {
  await requireUser();
  const schemeTemplates = getSchemeTemplates();

  return (
    <>
      <PageHeader
        title="Scheme templates"
        description="Government scheme reference rates and lock-in periods."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/finance/investments" />}
          >
            Back to Investments
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Scheme templates</h2>
        <AddSchemeTemplateDialog />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Lock-in</TableHead>
              <TableHead className="text-right">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schemeTemplates.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.lockInMonths ? `${s.lockInMonths} mo` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.interestRate ? `${s.interestRate}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
