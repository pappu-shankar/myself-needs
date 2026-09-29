import { NextResponse, type NextRequest } from "next/server";

/**
 * Two protections in front of every request:
 *
 * 1. Host allow-list. The app listens on 127.0.0.1 only, but a malicious web page
 *    can still reach it through DNS rebinding (its own hostname re-pointed at
 *    127.0.0.1). Such requests carry the attacker's hostname in `Host`, so
 *    anything that isn't a loopback name is refused before it reaches a page,
 *    Server Action or route handler.
 * 2. Content-Security-Policy with a per-request nonce. `connect-src 'self'` means
 *    no script on the page can send data anywhere else — including the usage
 *    telemetry beacon bundled inside MediaPipe.
 */

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostnameOf(hostHeader: string): string {
  return hostHeader.toLowerCase().replace(/:\d+$/, "");
}

function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets MediaPipe's WebAssembly compile; 'unsafe-eval' is
    // only for React's dev-mode error overlays.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by charts, the 3D canvas and popover positioning.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  if (!LOOPBACK_HOSTNAMES.has(hostnameOf(request.headers.get("host") ?? ""))) {
    return new NextResponse("This app only accepts requests addressed to 127.0.0.1 or localhost.", {
      status: 403,
    });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), payment=(), usb=()");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|models/).*)"],
};
