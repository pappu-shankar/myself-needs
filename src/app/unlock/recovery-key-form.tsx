"use client";

import type { UnlockWithRecoveryKeyState } from "@/modules/core/session/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

export function RecoveryKeyForm({
  state,
  formAction,
  isPending,
  recoveryKeyValue,
  onRecoveryKeyChange,
  onBack,
}: {
  state: UnlockWithRecoveryKeyState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
  recoveryKeyValue: string;
  onRecoveryKeyChange: (value: string) => void;
  onBack: () => void;
}) {
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormField
        label="Recovery key"
        htmlFor="recoveryKey"
        hint="The key you saved when you first set up your vault."
        error={state.error}
      >
        <Input
          type="text"
          name="recoveryKey"
          autoFocus
          required
          placeholder="xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx"
          value={recoveryKeyValue}
          onChange={(e) => onRecoveryKeyChange(e.target.value)}
          className="font-mono"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </FormField>

      <Button type="submit" disabled={isPending} className="mt-1">
        {isPending ? "Verifying…" : "Verify recovery key"}
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground text-sm underline-offset-4 hover:underline"
      >
        Back to passphrase
      </button>
    </form>
  );
}
