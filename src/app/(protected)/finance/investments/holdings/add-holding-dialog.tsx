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
import { HoldingForm } from "./holding-form";

interface AddHoldingDialogProps {
  accounts: { id: number; name: string }[];
  schemeTemplates: { id: number; name: string }[];
  goals: { id: number; name: string }[];
}

export function AddHoldingDialog({ accounts, schemeTemplates, goals }: AddHoldingDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add holding</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add holding</DialogTitle>
          <DialogDescription>
            Equity, mutual funds, bonds, gold, FD/RD, chit funds, government schemes, and more.
          </DialogDescription>
        </DialogHeader>
        <HoldingForm
          accounts={accounts}
          schemeTemplates={schemeTemplates}
          goals={goals}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
