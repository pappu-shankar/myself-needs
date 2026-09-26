// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // This repo's one-off verification server build dir (AGENTS.md) — same
    // reason as .next/** above, just a different distDir.
    ".next-verify/**",
    // Vendored, gitignored MediaPipe WASM/model assets for the fashion
    // module (scripts/fetch-fashion-models.sh) — generated third-party
    // binaries/bundles, not source we own or want linted.
    "public/models/**",
  ]),
  ...storybook.configs["flat/recommended"]
]);

export default eslintConfig;
