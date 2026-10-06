"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeAvatarAction, uploadAvatarAction } from "@/modules/core/auth/account-actions";
import { Button } from "@/components/ui/button";
import { UserAvatar, type AvatarUser } from "../sidebar-avatar";
import { resizeAvatar } from "./avatar-resize";

/**
 * Pick a picture → resized in the browser → uploaded. The fresh picture is
 * shown from the local copy straight away (the served one may be cached).
 */
export function AvatarUploader({ user }: { user: AvatarUser }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const hasPicture = preview !== null || (user.hasAvatar && !removed);
  const shown: AvatarUser = { ...user, hasAvatar: hasPicture };

  function upload(file: File) {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      let dataUrl: string;
      try {
        dataUrl = await resizeAvatar(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That picture couldn't be used.");
        return;
      }
      const formData = new FormData();
      formData.set("avatar", dataUrl);
      const result = await uploadAvatarAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview(dataUrl);
      setRemoved(false);
      setStatus("Picture updated.");
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await removeAvatarAction({});
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview(null);
      setRemoved(true);
      setStatus("Picture removed.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar user={shown} size="lg" src={preview} />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a picture"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            {isPending ? "Working…" : hasPicture ? "Change picture" : "Upload picture"}
          </Button>
          {hasPicture && (
            <Button type="button" variant="ghost" disabled={isPending} onClick={remove}>
              Remove picture
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Square-cropped and shrunk to 256 × 256 on this device before upload. Pictures are stored
        unencrypted, like your username.
      </p>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <p role="status" className="text-sm empty:hidden">
        {status}
      </p>
    </div>
  );
}
