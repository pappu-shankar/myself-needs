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
import { SchemeTemplateForm } from "./scheme-template-form";

export function AddSchemeTemplateDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add scheme template</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add scheme template</DialogTitle>
          <DialogDescription>
            Government scheme reference rates and lock-in periods.
          </DialogDescription>
        </DialogHeader>
        <SchemeTemplateForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
