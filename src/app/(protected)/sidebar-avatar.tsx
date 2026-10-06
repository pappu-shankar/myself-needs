import { cn } from "@/lib/utils";

/** What every avatar needs to render — a subset of `MyProfile`, safe to pass to the client. */
export interface AvatarUser {
  id: string;
  username: string;
  displayName: string | null;
  color: string | null;
  hasAvatar: boolean;
  /** Picture file mtime; versions the URL so a new upload isn't served from cache. */
  avatarVersion?: number | null;
}

export function displayNameOf(user: Pick<AvatarUser, "username" | "displayName">): string {
  return user.displayName?.trim() || user.username;
}

function initialsOf(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
  return letters.toUpperCase();
}

/** Black or white text, whichever reads better on a #rrggbb background. */
function textOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#111111" : "#ffffff";
}

const SIZES = { sm: "size-6 text-[0.625rem]", md: "size-8 text-xs", lg: "size-16 text-lg" };

/**
 * The user's picture (served by `/api/avatars/<id>?v=<mtime>`), or their initials on
 * their chosen colour. Decorative by default — the name is always shown or
 * announced next to it.
 */
export function UserAvatar({
  user,
  size = "md",
  src,
  className,
}: {
  user: AvatarUser;
  size?: keyof typeof SIZES;
  /** Overrides the served picture (e.g. a just-picked local preview). */
  src?: string | null;
  className?: string;
}) {
  const picture =
    src ??
    (user.hasAvatar
      ? `/api/avatars/${user.id}${user.avatarVersion ? `?v=${user.avatarVersion}` : ""}`
      : null);
  const base = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium select-none",
    SIZES[size],
    className,
  );
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a tiny private image from our own route; next/image adds nothing here
      <img src={picture} alt="" aria-hidden="true" className={cn(base, "object-cover")} />
    );
  }
  const color = user.color ?? null;
  return (
    <span
      aria-hidden="true"
      className={cn(base, !color && "bg-sidebar-primary text-sidebar-primary-foreground")}
      style={color ? { backgroundColor: color, color: textOn(color) } : undefined}
    >
      {initialsOf(displayNameOf(user))}
    </span>
  );
}
