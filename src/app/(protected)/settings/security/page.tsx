import type { Metadata } from "next";
import Link from "next/link";
import { listMyAlerts, listMyAuditEvents } from "@/modules/core/auth/queries";
import { requireUser } from "@/modules/core/session/guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWhen } from "../format-when";
import { AlertList, type AlertRow } from "./alert-list";

export const metadata: Metadata = {
  title: "Security — Settings — Personal Life OS",
};

export default async function SecuritySettingsPage() {
  const scope = await requireUser();
  const alerts: AlertRow[] = listMyAlerts(scope.userId).map((a) => ({
    id: a.id,
    severity: a.severity,
    title: a.title,
    message: a.message,
    when: formatWhen(a.at),
  }));
  const activity = listMyAuditEvents(scope.userId, { limit: 25 });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Security alerts</CardTitle>
          <CardDescription>
            Unusual activity on your account in the last 30 days. Dismiss an alert once you&apos;ve
            checked it. To end a session you don&apos;t recognise, go to{" "}
            <Link href="/settings/devices" className="text-primary underline underline-offset-4">
              Devices
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertList alerts={alerts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            Sign-ins, sign-outs and account changes, newest first. The network is the first part of
            the IP address only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {activity.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">
                      {e.label}
                      {e.note && (
                        <span className="text-muted-foreground font-normal"> ({e.note})</span>
                      )}
                    </p>
                    {(e.device || e.network) && (
                      <p className="text-muted-foreground text-xs break-words">
                        {[e.device, e.network].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <time
                    dateTime={new Date(e.at).toISOString()}
                    className="text-muted-foreground shrink-0 text-xs tabular-nums"
                  >
                    {formatWhen(e.at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
