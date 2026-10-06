import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/modules/core/session/guard";
import {
  getHealthStats,
  getVaultStorageStats,
  listRecentSecurityEventsForAdmin,
  listUsersForAdmin,
} from "@/modules/core/auth/queries";
import { getAppVersionLabel } from "@/modules/core/env/app-version";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTile } from "./stat-tile";
import { formatAge, formatBytes, formatDuration, formatMegabytes, formatWhen } from "./format";

export const metadata: Metadata = { title: "Admin — Personal Life OS" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdmin();
  const stats = getHealthStats();
  const users = listUsersForAdmin();
  const admins = users.filter((u) => u.role === "admin").length;
  const disabled = users.filter((u) => u.status === "disabled").length;
  const locked = users.filter((u) => u.lockedUntil).length;
  const version = getAppVersionLabel();
  const events = listRecentSecurityEventsForAdmin(25);
  const vaults = getVaultStorageStats();
  const totalBytes = vaults.reduce((sum, v) => sum + v.sizeBytes, 0);

  return (
    <>
      <PageHeader
        title="Admin overview"
        description="Account and server health. Admins manage accounts only — never anyone's data."
      />
      <section aria-labelledby="accounts-h" className="flex flex-col gap-3">
        <h2 id="accounts-h" className="text-lg font-semibold">
          Accounts
        </h2>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Accounts"
            value={stats.accounts}
            hint={`${stats.activeAccounts} active`}
          />
          <StatTile label="Admins" value={admins} hint={`${stats.accounts - admins} members`} />
          <StatTile label="Disabled" value={disabled} />
          <StatTile label="Locked out" value={locked} tone={locked > 0 ? "warning" : "default"} />
        </div>
      </section>
      <section aria-labelledby="live-h" className="mt-6 flex flex-col gap-3">
        <h2 id="live-h" className="text-lg font-semibold">
          Live activity
        </h2>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Online now" value={stats.onlineUsers} />
          <StatTile label="Live sessions" value={stats.liveSessions} />
          <StatTile label="Open vaults" value={stats.openVaults} />
          <StatTile
            label="KDF queue"
            value={`${stats.kdf.running} / ${stats.kdf.queued}`}
            hint="Running / queued key derivations"
          />
          <StatTile label="Failed logins (24h)" value={stats.failedLogins24h} />
          <StatTile
            label="Throttles (24h)"
            value={stats.throttled24h}
            tone={stats.throttled24h > 0 ? "warning" : "default"}
          />
        </div>
      </section>
      <section aria-labelledby="server-h" className="mt-6 flex flex-col gap-3">
        <h2 id="server-h" className="text-lg font-semibold">
          Server
        </h2>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Memory (RSS)" value={formatMegabytes(stats.memoryRssBytes)} />
          <StatTile label="Uptime" value={formatDuration(stats.uptimeSeconds)} />
          <StatTile label="App version" value={version} />
          <StatTile
            label="Vault storage"
            value={formatBytes(totalBytes)}
            hint={`${vaults.length} vaults`}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          For uptime monitoring, point a checker at{" "}
          <Link href="/healthz" className="underline underline-offset-4">
            /healthz
          </Link>
          . It is public and returns only <code>ok</code> and the version.
        </p>
      </section>
      <section aria-labelledby="security-h" className="mt-6 flex flex-col gap-3">
        <h2 id="security-h" className="text-lg font-semibold">
          Recent security events
        </h2>
        <p className="text-muted-foreground text-sm">
          Failed and locked-out sign-ins, invite activity and new-device sign-ins to admin accounts.
          Networks are IP prefixes only.
        </p>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Device</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="tabular-nums">{formatWhen(e.at)}</TableCell>
                  <TableCell>
                    {e.label}
                    {e.reason === "unknown-user" && (
                      <span className="text-muted-foreground"> (unknown username)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {e.username ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">{e.network ?? "—"}</TableCell>
                  <TableCell>{e.device ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <section aria-labelledby="storage-h" className="mt-6 flex flex-col gap-3">
        <h2 id="storage-h" className="text-lg font-semibold">
          Storage &amp; migrations
        </h2>
        <p className="text-muted-foreground text-sm">
          Size on disk includes automatic pre-migration backups. A vault&apos;s schema version can
          only be read while it&apos;s open (its owner is signed in) — it&apos;s never opened for
          this page.
        </p>
        {vaults.length === 0 ? (
          <p className="text-muted-foreground text-sm">No vaults yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vault</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Migrations</TableHead>
                <TableHead>Newest backup</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vaults.map((v) => (
                <TableRow key={`${v.kind}:${v.id}`}>
                  <TableCell>
                    {v.kind === "user"
                      ? (v.owner ?? `Unknown user ${v.id.slice(0, 8)}`)
                      : `Space ${v.id.slice(0, 8)}`}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatBytes(v.sizeBytes)}</TableCell>
                  <TableCell className="tabular-nums">
                    {v.migrationsApplied === null ? (
                      <Badge variant="outline">closed</Badge>
                    ) : (
                      <span
                        className={
                          v.migrationsApplied < v.migrationsLatest ? "text-destructive" : undefined
                        }
                      >
                        {v.migrationsApplied} / {v.migrationsLatest}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatAge(v.newestBackupAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
