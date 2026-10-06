const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatWhen(ms: number | null | undefined): string {
  return ms ? dateTime.format(new Date(ms)) : "—";
}

export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024).toLocaleString("en-IN")} MB`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString("en-IN")} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("en-IN", { maximumFractionDigits: 1 })} MB`;
}

/** "3d 4h ago" for an epoch-millisecond timestamp; "—" for none. */
export function formatAge(ms: number | null, now: number = Date.now()): string {
  if (ms === null) return "—";
  return `${formatDuration(Math.max(0, Math.round((now - ms) / 1000)))} ago`;
}
