"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransactionForm } from "./transaction-form";

interface AddTransactionDialogProps {
  accounts: { id: number; name: string }[];
  categories: { id: number; name: string; type: string }[];
}

export function AddTransactionDialog({ accounts, categories }: AddTransactionDialogProps) {
  const [open, setOpen] = useState(false);

  if (accounts.length === 0) {
    return (
      <Link
        href="/finance/accounts"
        className="text-primary text-sm underline-offset-4 hover:underline"
      >
        Add an account first →
      </Link>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add transaction</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>
            Income, expenses, and transfers across your accounts.
          </DialogDescription>
        </DialogHeader>
        <TransactionForm
          accounts={accounts}
          categories={categories}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
