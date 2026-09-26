"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AccountForm } from "./account-form";

export function AddAccountDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add account</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add account</DialogTitle>
          <DialogDescription>Bank accounts, cards, loans, and other balances.</DialogDescription>
        </DialogHeader>
        <AccountForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
