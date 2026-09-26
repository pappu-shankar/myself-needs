"use client";

import { useActionState, useState } from "react";
import {
  unlockAction,
  unlockWithRecoveryKeyAction,
  resetPassphraseAfterRecoveryAction,
  type UnlockState,
  type UnlockWithRecoveryKeyState,
  type ResetPassphraseState,
} from "@/modules/core/session/actions";
import { PassphraseForm } from "./passphrase-form";
import { RecoveryKeyForm } from "./recovery-key-form";
import { RecoveryKeyReveal } from "./recovery-key-reveal";
import { ResetPassphraseForm } from "./reset-passphrase-form";

const unlockInitialState: UnlockState = {};
const recoveryInitialState: UnlockWithRecoveryKeyState = {};
const resetInitialState: ResetPassphraseState = {};

export function UnlockForm({ isFirstRun }: { isFirstRun: boolean }) {
  const [unlockState, unlockFormAction, unlockPending] = useActionState(
    unlockAction,
    unlockInitialState,
  );
  const [recoveryState, recoveryFormAction, recoveryPending] = useActionState(
    unlockWithRecoveryKeyAction,
    recoveryInitialState,
  );
  const [resetState, resetFormAction, resetPending] = useActionState(
    resetPassphraseAfterRecoveryAction,
    resetInitialState,
  );

  const [showingRecovery, setShowingRecovery] = useState(false);
  const [recoveryKeyValue, setRecoveryKeyValue] = useState("");

  if (unlockState.recoveryKeyReveal) {
    return <RecoveryKeyReveal recoveryKey={unlockState.recoveryKeyReveal} />;
  }

  if (recoveryState.verified) {
    return (
      <ResetPassphraseForm
        recoveryKey={recoveryKeyValue}
        state={resetState}
        formAction={resetFormAction}
        isPending={resetPending}
      />
    );
  }

  if (showingRecovery) {
    return (
      <RecoveryKeyForm
        state={recoveryState}
        formAction={recoveryFormAction}
        isPending={recoveryPending}
        recoveryKeyValue={recoveryKeyValue}
        onRecoveryKeyChange={setRecoveryKeyValue}
        onBack={() => setShowingRecovery(false)}
      />
    );
  }

  return (
    <PassphraseForm
      isFirstRun={isFirstRun}
      state={unlockState}
      formAction={unlockFormAction}
      isPending={unlockPending}
      onForgotPassphrase={() => setShowingRecovery(true)}
    />
  );
}
