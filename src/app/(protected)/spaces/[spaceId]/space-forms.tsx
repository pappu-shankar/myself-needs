"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSpaceAction,
  inviteMemberAction,
  leaveSpaceAction,
  renameSpaceAction,
  setSpaceModulesAction,
} from "@/modules/core/spaces/actions";
import type { SpaceModule, SpaceRole } from "@/modules/core/auth/spaces-store";
import type { ActionState } from "@/modules/core/action/types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ModuleCheckboxes } from "../module-checkboxes";
import { ROLE_DESCRIPTIONS } from "../space-labels";

const initialState: ActionState = {};
const selectClass = "border-input bg-background h-8 rounded-md border px-2 text-sm";

function FormMessages({ state, success }: { state: ActionState<unknown>; success?: string }) {
  return (
    <>
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && success && (
        <p role="status" className="text-sm">
          {success}
        </p>
      )}
    </>
  );
}

export function InviteMemberForm({ spaceId }: { spaceId: string }) {
  const [state, formAction, isPending] = useActionState(inviteMemberAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useActionSuccess(state, () => formRef.current?.reset());
  const roles: SpaceRole[] = ["editor", "viewer", "owner"];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <FormField
        label="Username"
        htmlFor="inviteUsername"
        hint="They need an account here already. They'll see the space next time they sign in."
        error={state.fieldErrors?.username?.[0]}
      >
        <Input
          name="username"
          required
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          defaultValue={state.ok ? "" : (state.values?.username ?? "")}
        />
      </FormField>
      <FormField label="Role" htmlFor="inviteRole" error={state.fieldErrors?.role?.[0]}>
        <select name="role" defaultValue="editor" className={selectClass}>
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_DESCRIPTIONS[role]}
            </option>
          ))}
        </select>
      </FormField>
      <FormMessages state={state} success="Added to the space." />
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Adding…" : "Add person"}
      </Button>
    </form>
  );
}

export function SpaceModulesForm({
  spaceId,
  modules,
  enabled,
}: {
  spaceId: string;
  modules: readonly SpaceModule[];
  enabled: readonly SpaceModule[];
}) {
  const [state, formAction, isPending] = useActionState(setSpaceModulesAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <ModuleCheckboxes
        modules={modules}
        defaultChecked={enabled}
        legend="Modules shown in this space"
        idPrefix="space-module"
      />
      <FormMessages state={state} success="Modules saved." />
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Saving…" : "Save modules"}
      </Button>
    </form>
  );
}

export function RenameSpaceForm({ spaceId, name }: { spaceId: string; name: string }) {
  const [state, formAction, isPending] = useActionState(renameSpaceAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <FormField label="Space name" htmlFor="renameSpace" error={state.fieldErrors?.name?.[0]}>
        <Input name="name" required maxLength={60} defaultValue={state.values?.name ?? name} />
      </FormField>
      <FormMessages state={state} success="Renamed." />
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Saving…" : "Rename"}
      </Button>
    </form>
  );
}

export function LeaveSpaceButton({ spaceId, name }: { spaceId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(leaveSpaceAction, initialState);
  useActionSuccess(state, () => {
    setOpen(false);
    router.push("/spaces");
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>Leave space</DialogTrigger>
      <DialogContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="spaceId" value={spaceId} />
          <DialogHeader>
            <DialogTitle>Leave {name}?</DialogTitle>
            <DialogDescription>
              You lose access straight away, and the space is re-keyed for the people still in it.
              An owner would have to add you again.
            </DialogDescription>
          </DialogHeader>
          <FormMessages state={state} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Leaving…" : "Leave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteSpaceForm({ spaceId, name }: { spaceId: string; name: string }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deleteSpaceAction, initialState);
  useActionSuccess(state, () => router.push("/spaces"));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <FormField
        label={`Type the space's name (${name}) to confirm`}
        htmlFor="confirmSpaceName"
        error={state.fieldErrors?.confirmName?.[0]}
      >
        <Input name="confirmName" required autoComplete="off" spellCheck={false} />
      </FormField>
      <FormMessages state={state} />
      <Button type="submit" variant="destructive" disabled={isPending} className="self-start">
        {isPending ? "Deleting…" : "Delete space and its data"}
      </Button>
    </form>
  );
}
