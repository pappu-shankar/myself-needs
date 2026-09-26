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
import { BudgetForm } from "./budget-form";

interface AddBudgetDialogProps {
  categories: { id: number; name: string }[];
}

export function AddBudgetDialog({ categories }: AddBudgetDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add budget</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add budget</DialogTitle>
          <DialogDescription>Monthly spending limits by category.</DialogDescription>
        </DialogHeader>
        {categories.length === 0 ? (
          <p className="text-muted-foreground text-sm">Add an expense category first.</p>
        ) : (
          <BudgetForm categories={categories} onSuccess={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
