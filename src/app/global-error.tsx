"use client";

import "./globals.css";

/** Last-resort boundary for errors in the root layout itself. Renders its own
 * document, so it can't rely on the theme provider or fonts. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground flex min-h-svh items-center justify-center p-6">
        <title>Something went wrong — Personal Life OS</title>
        <div role="alert" className="max-w-md space-y-3 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            The app hit an unexpected error. Your data hasn&apos;t been changed.
            {error.digest ? ` (Reference: ${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
