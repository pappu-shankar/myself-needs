import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { getAccounts } from "@/modules/finance";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { AddAccountDialog } from "./add-account-dialog";

export const metadata: Metadata = {
  title: "Accounts — Personal Life OS",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function AccountsPage() {
  await requireUser();
  const accounts = getAccounts();

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Bank accounts, cards, loans, and other balances."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">All accounts</h2>
        <AddAccountDialog />
      </div>

      {accounts.length === 0 ? (
        <EmptyState title="No accounts yet" description="Add your first account to get started." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link
                      href={`/finance/transactions?accountId=${a.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {a.type.replace("_", " ")}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${a.balance < 0 ? "text-destructive" : ""}`}
                  >
                    {formatAmount(a.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
