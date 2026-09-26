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
import { RecurringRuleForm } from "./recurring-rule-form";

interface AddRecurringRuleDialogProps {
  accounts: { id: number; name: string }[];
  categories: { id: number; name: string; type: string }[];
  goals: { id: number; name: string }[];
}

export function AddRecurringRuleDialog({
  accounts,
  categories,
  goals,
}: AddRecurringRuleDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add recurring rule</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add recurring rule</DialogTitle>
          <DialogDescription>
            Recurring rules — rent, subscriptions, EMIs — and their unconfirmed occurrences.
          </DialogDescription>
        </DialogHeader>
        <RecurringRuleForm
          accounts={accounts}
          categories={categories}
          goals={goals}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
