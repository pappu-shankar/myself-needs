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
import { InsuranceForm } from "./insurance-form";

interface AddInsuranceDialogProps {
  recurringRules: { id: number; note: string | null }[];
}

export function AddInsuranceDialog({ recurringRules }: AddInsuranceDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add insurance policy</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add insurance policy</DialogTitle>
          <DialogDescription>Life, health, term, and vehicle insurance policies.</DialogDescription>
        </DialogHeader>
        <InsuranceForm recurringRules={recurringRules} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
