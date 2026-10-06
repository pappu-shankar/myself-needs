"use client";

import { useState } from "react";
import { acknowledgeRecoveryKeyAction } from "@/modules/core/auth/actions";
import { Button } from "@/components/ui/button";

/**
 * Shows a new account's recovery key exactly once, with a copy button and an
 * "I saved it" gate before continuing (which clears the session's
 * reveal-pending flag and goes to the dashboard).
 *
 * Without a key — the page was reloaded after the reveal — it explains that the
 * key can't be shown again and offers a new one from Settings instead.
 */
export function RecoveryKeyReveal({ recoveryKey }: { recoveryKey?: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [continuing, setContinuing] = useState(false);

  if (!recoveryKey) {
    return (
      <form
        action={acknowledgeRecoveryKeyAction}
        onSubmit={() => setContinuing(true)}
        className="flex flex-col gap-5"
      >
        <p className="text-muted-foreground text-sm">
          Your account is ready. Its recovery key was shown once and can&apos;t be displayed again.
          If you didn&apos;t save it, create a new one in Settings → Rotate recovery key.
        </p>
        <Button type="submit" variant="default" disabled={continuing}>
          {continuing ? "Continuing…" : "Continue to dashboard"}
        </Button>
      </form>
    );
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(recoveryKey ?? "");
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Your recovery key</h2>
        <p className="text-muted-foreground text-sm">
          Save this somewhere safe — a password manager or a printed copy. It&apos;s the only way
          back in if you forget your password (nobody else, not even the admin, can reset it), and
          it will never be shown again.
        </p>
      </div>

      <output
        aria-label="Recovery key"
        className="bg-muted block rounded-lg border p-3 text-center font-mono text-sm tracking-wide break-all select-all"
      >
        {recoveryKey}
      </output>

      <Button type="button" variant="outline" onClick={handleCopy}>
        {copied ? "Copied" : "Copy to clipboard"}
      </Button>
      <p aria-live="polite" className="text-muted-foreground -mt-3 text-sm empty:hidden">
        {copyFailed ? "Couldn't copy — select the key and copy it manually." : ""}
      </p>

      <form
        action={acknowledgeRecoveryKeyAction}
        onSubmit={() => setContinuing(true)}
        className="flex flex-col gap-5"
      >
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="recoveryKeyAcknowledged"
            className="mt-0.5 size-4 shrink-0"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <label htmlFor="recoveryKeyAcknowledged" className="text-sm font-medium">
            I&apos;ve saved this recovery key somewhere safe
          </label>
        </div>

        <Button type="submit" variant="default" disabled={!acknowledged || continuing}>
          {continuing ? "Continuing…" : "Continue to dashboard"}
        </Button>
      </form>
    </div>
  );
}
