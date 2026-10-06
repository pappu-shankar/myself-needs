"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Laptop } from "lucide-react";
import {
  signOutDeviceAction,
  signOutOtherDevicesAction,
} from "@/modules/core/auth/account-actions";
import type { ActionState } from "@/modules/core/action/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface DeviceRow {
  sid: string;
  device: string;
  network: string;
  sameNetwork: boolean;
  firstSeen: string;
  lastSeen: string;
  current: boolean;
  live: boolean;
}

const initialState: ActionState = {};

function SignOutDeviceButton({ sid, current }: { sid: string; current: boolean }) {
  const [state, formAction, isPending] = useActionState(signOutDeviceAction, initialState);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1 sm:items-end">
      <input type="hidden" name="sid" value={sid} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Signing out…" : current ? "Sign out this device" : "Sign out"}
      </Button>
      {state.error && (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      )}
    </form>
  );
}

function DeviceItem({ row }: { row: DeviceRow }) {
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <Laptop className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="break-words">{row.device}</span>
            {row.current && <Badge>This device</Badge>}
            {!row.live && <Badge variant="secondary">Signed out</Badge>}
          </p>
          <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt>Network</dt>
            <dd className="break-all">
              {row.network}
              {row.sameNetwork && !row.current && " (same network as this device)"}
            </dd>
            <dt>First seen</dt>
            <dd>{row.firstSeen}</dd>
            <dt>Last seen</dt>
            <dd>{row.lastSeen}</dd>
          </dl>
        </div>
      </div>
      {row.live && <SignOutDeviceButton sid={row.sid} current={row.current} />}
    </li>
  );
}

/** Signs out every other live device in one go (this one stays signed in). */
function SignOutOthersButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          setError(null);
          setDone(false);
          startTransition(async () => {
            const result = await signOutOtherDevicesAction({});
            if (result.error) setError(result.error);
            else setDone(true);
            router.refresh();
          });
        }}
      >
        {isPending ? "Signing out…" : "Sign out all other devices"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {done && !error && (
        <p role="status" className="text-sm">
          Other devices signed out.
        </p>
      )}
    </div>
  );
}

export function DeviceList({ live, past }: { live: DeviceRow[]; past: DeviceRow[] }) {
  const hasOthers = live.some((row) => !row.current);
  return (
    <div className="space-y-6">
      <section aria-labelledby="signed-in-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="signed-in-heading" className="text-sm font-semibold">
            Signed in now ({live.length})
          </h2>
          {hasOthers && <SignOutOthersButton />}
        </div>
        <ul className="divide-y">
          {live.map((row) => (
            <DeviceItem key={row.sid} row={row} />
          ))}
        </ul>
      </section>
      {past.length > 0 && (
        <section aria-labelledby="past-heading" className="space-y-3">
          <h2 id="past-heading" className="text-sm font-semibold">
            Recent sign-ins
          </h2>
          <ul className="divide-y">
            {past.map((row) => (
              <DeviceItem key={row.sid} row={row} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
