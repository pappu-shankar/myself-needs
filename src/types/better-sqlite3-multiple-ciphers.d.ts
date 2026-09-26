// better-sqlite3-multiple-ciphers is an API-compatible drop-in fork of
// better-sqlite3 (adds SQLCipher/multi-cipher support) but its own published
// types aren't resolvable under "moduleResolution: bundler" — this shim reuses
// @types/better-sqlite3's shape, which matches.
declare module "better-sqlite3-multiple-ciphers" {
  import Database from "better-sqlite3";
  export = Database;
}
