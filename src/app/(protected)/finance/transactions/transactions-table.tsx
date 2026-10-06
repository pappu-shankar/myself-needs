"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { TransactionRow } from "@/modules/finance";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const columns: DataTableColumnDef<TransactionRow>[] = [
  {
    accessorKey: "date",
    header: "Date",
    meta: { width: "110px" },
  },
  {
    accessorKey: "type",
    header: "Type",
    meta: { width: "90px" },
    cell: ({ row }) => (
      <span className="text-muted-foreground capitalize">{row.original.type}</span>
    ),
  },
  {
    id: "account",
    header: "Account",
    cell: ({ row }) => {
      const t = row.original;
      return t.type === "transfer" ? `${t.accountName} → ${t.toAccountName}` : t.accountName;
    },
  },
  {
    accessorKey: "categoryName",
    header: "Category",
    cell: ({ row }) => row.original.categoryName ?? "—",
  },
  {
    accessorKey: "amount",
    header: "Amount",
    meta: { align: "right", width: "140px" },
    cell: ({ row }) => {
      const t = row.original;
      return (
        <span className={t.type === "expense" ? "text-destructive" : ""}>
          {t.type === "expense" ? "-" : t.type === "income" ? "+" : ""}
          {formatAmount(t.amount)}
        </span>
      );
    },
  },
  {
    accessorKey: "note",
    header: "Note",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.note ?? ""}</span>,
  },
];

export function TransactionsTable({
  transactions,
  hasAccounts,
  filterAccountName,
  olderHref,
  newerHref,
  className,
}: {
  transactions: TransactionRow[];
  hasAccounts: boolean;
  /** Set when the list is filtered to one account (via ?accountId=) — changes the empty-state copy so it's clear the filter is why nothing shows. */
  filterAccountName?: string;
  /** Keyset-pagination links — real `<a href>`s (via `Link`), so paging works without client JS. Omitted when there's no further page in that direction. */
  olderHref?: string;
  newerHref?: string;
  className?: string;
}) {
  const data = useMemo(() => transactions, [transactions]);

  const emptyTitle = !hasAccounts
    ? "Add an account first"
    : filterAccountName
      ? "No transactions for this account yet"
      : "No transactions yet";
  const emptyDescription = !hasAccounts
    ? "Transactions belong to an account — create one before logging anything here."
    : filterAccountName
      ? `Nothing logged against ${filterAccountName} yet.`
      : "Add your first transaction to get started.";

  const newerButton = newerHref ? (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link href={newerHref} aria-label="Newer transactions" />}
    >
      Newer
    </Button>
  ) : (
    <Button variant="outline" size="sm" disabled>
      Newer
    </Button>
  );
  const olderButton = olderHref ? (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link href={olderHref} aria-label="Older transactions" />}
    >
      Older
    </Button>
  ) : (
    <Button variant="outline" size="sm" disabled>
      Older
    </Button>
  );
  const pager =
    olderHref || newerHref ? (
      <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
        {newerButton}
        {olderButton}
      </div>
    ) : undefined;

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyAction={
        !hasAccounts ? (
          <Link
            href="/finance/accounts"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Go to Accounts
          </Link>
        ) : (
          filterAccountName && (
            <Link
              href="/finance/transactions"
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Clear filter
            </Link>
          )
        )
      }
      footer={pager}
      className={className}
    />
  );
}
