import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native Node addon — must not be bundled by webpack/Turbopack, just required
  // directly at runtime. See docs/architecture/security.md.
  serverExternalPackages: ["better-sqlite3-multiple-ciphers", "better-sqlite3"],

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
