import type { NextConfig } from "next";

// Read at BUILD time (Server Actions' allowedOrigins is baked into the build), so
// APP_PUBLIC_ORIGIN must be set when `next build` runs — see docs/deploy.md.
const publicHost = (() => {
  const raw = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    throw new Error(`Invalid configuration: APP_PUBLIC_ORIGIN is not a valid URL ("${raw}").`);
  }
})();

const nextConfig: NextConfig = {
  // Native Node addon — must not be bundled by webpack/Turbopack, just required
  // directly at runtime. See docs/architecture/security.md.
  serverExternalPackages: ["better-sqlite3-multiple-ciphers"],

  poweredByHeader: false,

  experimental: {
    serverActions: {
      // Fashion photo/garment uploads go through Server Actions; the 1MB default
      // rejects ordinary phone photos. Clients downscale before uploading, so this
      // is headroom, not an invitation to send originals.
      bodySizeLimit: "10mb",
      ...(publicHost ? { allowedOrigins: [publicHost] } : {}),
    },
  },

  // Required for @react-three/fiber (house module's 3D viewer) — three.js ships
  // untranspiled ESM that Next.js needs to run through its own build pipeline.
  transpilePackages: ["three"],

  // `next dev`'s single-instance lock lives under distDir, keyed by directory —
  // not by port — so a second `next dev` for this same project refuses to start
  // even on a different port while another one is running. Setting NEXT_DIST_DIR
  // (e.g. to `.next-verify`) points a one-off verification server at its own
  // build/lock directory so it can run alongside a real dev session without
  // touching it. Unset in normal use — defaults to the standard `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
