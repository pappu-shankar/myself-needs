import type { Metadata } from "next";
import { signOutEverywhereAction } from "@/modules/core/auth/actions";
import { listMySessions } from "@/modules/core/auth/queries";
import { requireUser } from "@/modules/core/session/guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWhen } from "../format-when";
import { DeviceList, type DeviceRow } from "./device-list";

export const metadata: Metadata = {
  title: "Devices — Settings — Personal Life OS",
};

export default async function DevicesSettingsPage() {
  const scope = await requireUser();
  const sessions = listMySessions(scope).sort((a, b) => b.lastSeen - a.lastSeen);
  const currentPrefix = sessions.find((s) => s.current)?.ipPrefix ?? null;

  const rows: DeviceRow[] = sessions.map((s) => ({
    sid: s.sid,
    device: s.device ?? "Unknown device",
    network: s.ipPrefix ?? "Unknown network",
    sameNetwork: currentPrefix !== null && s.ipPrefix === currentPrefix,
    firstSeen: formatWhen(s.createdAt),
    lastSeen: formatWhen(s.lastSeen),
    current: s.current,
    live: s.live,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <CardDescription>
            Browsers signed in to your account. The network is the first part of the IP address only
            — there&apos;s no location lookup. If you don&apos;t recognise a device, sign it out and
            change your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeviceList live={rows.filter((r) => r.live)} past={rows.filter((r) => !r.live)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign out everywhere</CardTitle>
          <CardDescription>Ends every session on every device, including this one.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOutEverywhereAction}>
            <Button type="submit" variant="destructive">
              Sign out everywhere
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
