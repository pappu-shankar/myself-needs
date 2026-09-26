"use client";

import { useState } from "react";
import { acknowledgeRecoveryKeyAction } from "@/modules/core/session/actions";
import { Button } from "@/components/ui/button";

export function RecoveryKeyReveal({ recoveryKey }: { recoveryKey: string }) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Your recovery key</p>
        <p className="text-muted-foreground text-sm">
          Save this somewhere safe — a password manager or a printed backup. It&apos;s the only way
          back in if you forget your passphrase, and it will never be shown again.
        </p>
      </div>

      <div className="bg-muted rounded-lg border p-3 text-center font-mono text-sm tracking-wide select-all">
        {recoveryKey}
      </div>

      <Button type="button" variant="outline" onClick={handleCopy}>
        {copied ? "Copied" : "Copy to clipboard"}
      </Button>

      <form action={acknowledgeRecoveryKeyAction} className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="recoveryKeyAcknowledged"
            className="size-4"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <label htmlFor="recoveryKeyAcknowledged" className="text-sm font-medium">
            I&apos;ve saved this recovery key somewhere safe
          </label>
        </div>

        <Button type="submit" disabled={!acknowledged}>
          Continue to dashboard
        </Button>
      </form>
    </div>
  );
}
