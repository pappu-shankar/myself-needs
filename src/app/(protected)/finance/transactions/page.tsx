import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { getAccounts, getCategories, getTransactionsPage } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { AddTransactionDialog } from "./add-transaction-dialog";
import { TransactionsTable } from "./transactions-table";
import { encodeCursor, parseCursor } from "./cursor";

export const metadata: Metadata = {
  title: "Transactions — Personal Life OS",
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; before?: string; after?: string }>;
}) {
  await requireUser();
  const { accountId: accountIdParam, before: beforeParam, after: afterParam } = await searchParams;
  const accountId = accountIdParam ? Number(accountIdParam) : undefined;

  const accounts = getAccounts();
  const categories = getCategories();
  const filterAccount = accountId != null ? accounts.find((a) => a.id === accountId) : undefined;

  const {
    rows: transactions,
    hasOlder,
    hasNewer,
  } = getTransactionsPage({
    accountId: filterAccount?.id,
    before: parseCursor(beforeParam),
    after: parseCursor(afterParam),
  });

  // Build Older/Newer hrefs preserving the account filter — plain <Link>s so
  // paging works even without client JS. "Newer" from the very first page is
  // never offered (hasNewer is only true once a `before`/`after` cursor was used).
  const accountQuery = filterAccount ? `accountId=${filterAccount.id}` : "";
  function pageHref(param: "before" | "after", cursor: { date: string; id: number }) {
    const params = new URLSearchParams(accountQuery);
    params.set(param, encodeCursor(cursor));
    return `/finance/transactions?${params.toString()}`;
  }
  const oldest = transactions[transactions.length - 1];
  const newest = transactions[0];
  const olderHref = hasOlder && oldest ? pageHref("before", oldest) : undefined;
  const newerHref = hasNewer && newest ? pageHref("after", newest) : undefined;

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
        olderHref={olderHref}
        newerHref={newerHref}
        className="mb-6"
      />
    </>
  );
}
