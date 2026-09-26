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
import { ProjectForm, type ProjectFormValues } from "./project-form";

export function ProjectDialog({
  project,
  triggerLabel,
}: {
  project?: ProjectFormValues;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={project ? "outline" : "default"} size={project ? "sm" : "default"} />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "Add project"}</DialogTitle>
          <DialogDescription>
            A house or renovation design — rooms and floors live inside it.
          </DialogDescription>
        </DialogHeader>
        <ProjectForm project={project} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
