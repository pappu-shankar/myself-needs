# Multi-user — implementation contracts

Pinned interfaces for the multi-user migration (plan: per-user encrypted vaults, shared spaces, account registry). Parallel work units build against these; change them only by agreement.

## Vaults

A **vault** is one SQLCipher database with its own DEK and the full app schema (`drizzle/`).

```ts
// src/modules/core/db/vault-types.ts
type VaultRef = { kind: "user"; id: string } | { kind: "space"; id: string };
vaultKey(ref): string            // "user:<uuid>" | "space:<uuid>"
type SpaceRole = "owner" | "editor" | "viewer";
type AccountRole = "admin" | "member";
interface RequestScope {
  userId: string;
  role: AccountRole;
  sessionId: string;
  vault: VaultRef;                 // what getDb() returns for this request
  spaceRole: SpaceRole | null;     // set when vault.kind === "space"
}
```

Ids are `crypto.randomUUID()`; every path helper validates them with `assertSafeId` (UUID regex) before touching the filesystem.

## Paths — `src/modules/core/env/paths.ts`

```
getDataDir()                       // APP_DATA_DIR (unchanged)
getAccountsDbPath()                // <data>/accounts.db
getSessionSecretFilePath()         // unchanged
getUserDir(userId) / getSpaceDir(spaceId) / getVaultDir(ref)   // <data>/users/<id> | <data>/spaces/<id>, created 0700
vaultDbPath(dir) / vaultKeyringPath(dir) / vaultBackupsDir(dir)
getAvatarsDir()                    // <data>/avatars
getLegacyDbPath() / getLegacyKeyringPath()   // <data>/app.db, <data>/keyring.json (pre-multi-user layout)
getCurrentVaultDataDir()           // vault dir of the current RequestScope; throws when none (fashion files)
assertSafeId(id)
```

## Crypto — `src/modules/core/db/crypto.ts` (every vault function takes the vault dir first)

```
getVaultStatus(dir): "uninitialized" | "ready" | "missing-database" | "missing-keyring"
createVault(dir, password) → { recoveryKey, dekHex }
unlockWithPassword(dir, password) → dekHex          // CredentialError on wrong password
unlockWithRecoveryKey(dir, recoveryKey) → dekHex
rewrapPassword(dir, dekHex, newPassword)
changePassword(dir, current, next)
rotateRecoveryKey(dir, password) → recoveryKey
dummyUnwrap(password)                // same cost as a real unlock; for unknown usernames
KdfBusyError                         // thrown when the KDF queue (2 running, 8 queued) is full
getOrCreateSessionSecret()           // unchanged
```

Keyrings gain optional `kdf: { N, r, p }` (absent = the legacy N=2^17, r=8, p=1). New keyrings use `calibrateKdf()` (≈250 ms, N ≥ 2^15).

**Identity key pair** (for sharing space keys) — stored in the user's keyring as `identity: { publicKey (base64 raw X25519), privateKey: { iv, ciphertext, tag } }`, private key AES-256-GCM-encrypted with the user's DEK.

```
// src/modules/core/db/sealing.ts
generateIdentity(dekHex) → { publicKeyB64, encryptedPrivateKey }
openIdentity(dir, dekHex) → privateKey (KeyObject)
seal(secret: Buffer, recipientPublicKeyB64) → SealedBox { epk, iv, ciphertext, tag }   // ephemeral X25519 ECDH → HKDF-SHA256 → AES-256-GCM
unseal(box, privateKey) → Buffer
```

Space vaults have no password keyring: their DEK is generated at creation and stored only sealed to each member (`space_members.sealed_key` in accounts.db).

## Connections — `src/modules/core/db/client.ts`

```
openVault(ref, dekHex)            // migrations + backups as today, per vault dir; idempotent if open
closeVault(ref) / isVaultOpen(ref) / openVaultKeys()
getDb()                           // currentScope()?.vault → open connection, else VaultStateError
setTestDefaultDatabase(conn)      // NODE_ENV === "test" only; used when there is no scope
closeAllVaults()
```

Pool: LRU with `APP_MAX_OPEN_VAULTS` (default 50) and per-vault idle close (`APP_IDLE_LOCK_MINUTES`, default 30). Closing runs `PRAGMA optimize`. Connections set `busy_timeout = 5000`.

## Request scope — `src/modules/core/db/request-scope.ts` (`server-only`)

```
runWithScope(scope, fn)           // AsyncLocalStorage.run — actions, route handlers
bindRenderScope(scope)            // React cache() box — called only by requireUser()
currentScope(): RequestScope | undefined
```
No `enterWith`, ever.

## Account registry — `src/modules/core/auth/` (`data/accounts.db`, plain SQLite, raw SQL, `user_version` migrations)

Tables: `accounts`, `invites`, `sessions`, `audit`, `spaces`, `space_members`, `alerts_dismissed`. Store API (sync, better-sqlite3):

```
accounts: createAccount({username, role, publicKey}) → Account; findByUsername; findById; listAccounts;
          setStatus; setRole; deleteAccount; recordLogin(id, at); updateProfile(id, {displayName, color, hasAvatar});
          countActiveAdmins(); failure/lockout: recordFailure(id, now) → lockedUntil | null; clearFailures(id)
invites:  createInvite({createdBy, expiresAt, note}) → { token, invite }; redeemInvite(token, now) → invite | null (atomic);
          listInvites; revokeInvite(id)
sessions: createSession({sid, userId, ip, userAgent}); touchSession(sid, now); revokeSession(sid); revokeUserSessions(userId);
          listUserSessions(userId); isNewDevice(userId, uaSummary, ipPrefix)
audit:    recordAudit({event, userId?, actorId?, ip?, detail?}); listAudit({userId?, since?, limit})
spaces:   createSpace({name, ownerId, sealedKeyForOwner}); listSpacesForUser(userId) → [{space, role, sealedKey}];
          addMember({spaceId, userId, role, sealedKey}); setMemberRole; removeMember; listMembers(spaceId);
          replaceSealedKeys(spaceId, Map<userId, sealedKey>)   // re-key
```

Usernames: NFKC, lower-case, `^[a-z0-9][a-z0-9._-]{2,31}$`. Passwords: 12–256 chars, not in the bundled common list.

## Config — `src/modules/core/env/config.ts`

`APP_PUBLIC_ORIGIN`, `APP_ALLOWED_HOSTS`, `APP_TRUST_PROXY`, `APP_SETUP_TOKEN`, `APP_IDLE_LOCK_MINUTES`, `APP_SESSION_MAX_HOURS`, `APP_MAX_OPEN_VAULTS`, `APP_PROFILE_PICKER` — parsed once, typed `getConfig()`.

## Guards — `src/modules/core/session/guard.ts`

```
requireUser(): Promise<RequestScope>     // pages, layouts, generateMetadata; binds render scope; redirects /login
requireAdmin(): Promise<RequestScope>
withUser(fn)                             // route handlers / ad-hoc actions: requireUser + runWithScope
defineFormAction / defineAction          // requireUser + runWithScope; reject writes when spaceRole === "viewer"
defineAdminAction                        // requireAdmin; never opens other vaults
```
