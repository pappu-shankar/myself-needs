import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const session = {
    unlocked: false,
    epoch: undefined as string | undefined,
    recoveryKeyPending: false,
    save: vi.fn(),
    destroy: vi.fn(),
  };

  return {
    session,
    getVaultStatus: vi.fn(),
    createVault: vi.fn(),
    unlockWithPassphrase: vi.fn(),
    unlockWithRecoveryKey: vi.fn(),
    rewrapForNewPassphrase: vi.fn(),
    isDatabaseOpen: vi.fn(),
    openDatabase: vi.fn(),
    beginUnlockedSession: vi.fn(),
    endUnlockedSession: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
  };
});

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/modules/core/session/session", () => ({
  getSession: vi.fn(async () => mocks.session),
}));
vi.mock("@/modules/core/db/crypto", () => ({
  createVault: mocks.createVault,
  getVaultStatus: mocks.getVaultStatus,
  rewrapForNewPassphrase: mocks.rewrapForNewPassphrase,
  unlockWithPassphrase: mocks.unlockWithPassphrase,
  unlockWithRecoveryKey: mocks.unlockWithRecoveryKey,
}));
vi.mock("@/modules/core/db/client", () => ({
  isDatabaseOpen: mocks.isDatabaseOpen,
  openDatabase: mocks.openDatabase,
}));
vi.mock("@/modules/core/session/unlock-state", () => ({
  beginUnlockedSession: mocks.beginUnlockedSession,
  endUnlockedSession: mocks.endUnlockedSession,
}));

import {
  lockAction,
  resetPassphraseAfterRecoveryAction,
  unlockAction,
  unlockWithRecoveryKeyAction,
} from "./actions";
import { resetUnlockThrottle } from "./unlock-throttle";

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function expectRedirect(action: Promise<unknown>, path: string): Promise<void> {
  await expect(action).rejects.toThrow(`REDIRECT:${path}`);
}

describe("vault session lifecycle", () => {
  beforeEach(() => {
    resetUnlockThrottle();
    mocks.session.unlocked = false;
    mocks.session.epoch = undefined;
    mocks.session.recoveryKeyPending = false;
    mocks.session.save.mockClear();
    mocks.session.destroy.mockClear();
    mocks.getVaultStatus.mockReset();
    mocks.createVault.mockReset();
    mocks.unlockWithPassphrase.mockReset();
    mocks.unlockWithRecoveryKey.mockReset();
    mocks.rewrapForNewPassphrase.mockReset();
    mocks.isDatabaseOpen.mockReset();
    mocks.openDatabase.mockReset();
    mocks.beginUnlockedSession.mockReset();
    mocks.endUnlockedSession.mockReset();
    mocks.redirect.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("unlocks with a passphrase and records a successful session", async () => {
    mocks.getVaultStatus.mockReturnValue("ready");
    mocks.unlockWithPassphrase.mockResolvedValue("dek");
    mocks.isDatabaseOpen.mockReturnValue(false);
    mocks.beginUnlockedSession.mockReturnValue("epoch-1");

    await expectRedirect(
      unlockAction({}, formData({ passphrase: "correct horse battery staple" })),
      "/dashboard",
    );

    expect(mocks.openDatabase).toHaveBeenCalledWith("dek");
    expect(mocks.session.unlocked).toBe(true);
    expect(mocks.session.epoch).toBe("epoch-1");
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"event":"vault.unlocked"'));
  });

  it("locks the vault and revokes the session", async () => {
    mocks.session.unlocked = true;
    mocks.session.epoch = "epoch-1";

    await expectRedirect(lockAction(), "/unlock");

    expect(mocks.session.destroy).toHaveBeenCalledOnce();
    expect(mocks.endUnlockedSession).toHaveBeenCalledOnce();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"event":"vault.locked"'));
  });

  it("verifies recovery and resets the passphrase before opening a session", async () => {
    mocks.getVaultStatus.mockReturnValue("ready");
    mocks.unlockWithRecoveryKey.mockResolvedValue("dek");
    mocks.isDatabaseOpen.mockReturnValue(false);
    mocks.beginUnlockedSession.mockReturnValue("epoch-recovery");

    await expect(
      unlockWithRecoveryKeyAction({}, formData({ recoveryKey: "a".repeat(32) })),
    ).resolves.toEqual({ verified: true });

    await expectRedirect(
      resetPassphraseAfterRecoveryAction(
        {},
        formData({
          recoveryKey: "a".repeat(32),
          newPassphrase: "new correct passphrase",
          confirmNewPassphrase: "new correct passphrase",
        }),
      ),
      "/dashboard",
    );

    expect(mocks.rewrapForNewPassphrase).toHaveBeenCalledWith("dek", "new correct passphrase");
    expect(mocks.session.epoch).toBe("epoch-recovery");
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('"event":"vault.recovery.verified"'),
    );
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('"event":"vault.recovery.reset"'),
    );
  });
});
