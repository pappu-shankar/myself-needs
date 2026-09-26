import type { Metadata } from "next";
import Link from "next/link";
import { getAccounts, getCategories, getTransactionsPage } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { AddTransactionDialog } from "./add-transaction-dialog";
import { TransactionsTable } from "./transactions-table";

export const metadata: Metadata = {
  title: "Transactions — Personal Life OS",
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const { accountId: accountIdParam } = await searchParams;
  const accountId = accountIdParam ? Number(accountIdParam) : undefined;

  const accounts = getAccounts();
  const categories = getCategories();
  const filterAccount = accountId != null ? accounts.find((a) => a.id === accountId) : undefined;
  const { rows: transactions } = getTransactionsPage(
    0,
    filterAccount ? { accountId: filterAccount.id } : undefined,
  );

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Income, expenses, and transfers across your accounts."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">
          {filterAccount ? (
            <>
              Transactions for <span className="font-semibold">{filterAccount.name}</span>{" "}
              <Link
                href="/finance/transactions"
                className="text-primary text-sm font-normal underline-offset-4 hover:underline"
              >
                Clear filter
              </Link>
            </>
          ) : (
            "All transactions"
          )}
        </h2>
        <AddTransactionDialog accounts={accounts} categories={categories} />
      </div>

      <TransactionsTable
        transactions={transactions}
        hasAccounts={accounts.length > 0}
        filterAccountName={filterAccount?.name}
        className="mb-6"
      />
    </>
  );
}
