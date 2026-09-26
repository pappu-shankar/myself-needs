"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

type PassphraseInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "trailingIcon">;

/**
 * Password-style Input with a show/hide toggle. Used across the unlock flow
 * (create/confirm/reset passphrase) so users can verify what they typed.
 */
export function PassphraseInput(props: PassphraseInputProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <Input
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      {...props}
      type={visible ? "text" : "password"}
      trailingIcon={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide passphrase" : "Show passphrase"}
          className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md transition-colors"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      }
    />
  );
}
