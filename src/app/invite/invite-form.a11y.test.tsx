import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { RecoveryKeyReveal } from "@/app/(auth)/_components/recovery-key-reveal";
import { extractInviteToken, InviteForm } from "./invite-form";

vi.mock("@/modules/core/auth/actions", () => ({
  acceptInviteAction: vi.fn(async () => ({})),
  acknowledgeRecoveryKeyAction: vi.fn(async () => {}),
}));

const TOKEN = "A".repeat(40) + "b_-";

function stubPreview(valid: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ valid, expiresAt: valid ? Date.now() + 3_600_000 : null })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

function renderInvite(pendingReveal = false) {
  return render(
    <AuthCard title="Create your account">
      <InviteForm pendingReveal={pendingReveal} />
    </AuthCard>,
  );
}

describe("extractInviteToken", () => {
  it("accepts a bare code, a fragment or a whole link", () => {
    expect(extractInviteToken(TOKEN)).toBe(TOKEN);
    expect(extractInviteToken(`#${TOKEN}`)).toBe(TOKEN);
    expect(extractInviteToken(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(extractInviteToken(`https://life.example.com/invite#${TOKEN} `)).toBe(TOKEN);
    expect(extractInviteToken("nope")).toBeNull();
  });
});

describe("invite page accessibility", () => {
  it("has no violations when asking for a pasted code", async () => {
    const { container } = renderInvite();
    expect(screen.getByLabelText("Invite code")).toBeInTheDocument();
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations on the sign-up form for a valid link", async () => {
    stubPreview(true);
    window.location.hash = `#${TOKEN}`;
    const { container } = renderInvite();
    expect(await screen.findByText(/Invite valid until/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Invite code")).toBeNull();
    expect(screen.getByLabelText("Username")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expectNoAxeViolations(await axe(container));
  });

  it("explains an invite that can no longer be used, without a form", async () => {
    stubPreview(false);
    const { container } = renderInvite();
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: TOKEN } });
    expect(await screen.findByText(/expired, was already used/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations on the recovery-key reveal, and gates on 'I saved it'", async () => {
    const { container } = render(
      <AuthCard title="Save your recovery key">
        <RecoveryKeyReveal recoveryKey="a1b2c3d4-e5f6a7b8-c9d0e1f2-a3b4c5d6" />
      </AuthCard>,
    );
    const next = screen.getByRole("button", { name: "Continue to dashboard" });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/saved this recovery key/));
    expect(next).toBeEnabled();
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations when the reveal was already shown (reload)", async () => {
    const { container } = renderInvite(true);
    expect(screen.getByRole("button", { name: "Continue to dashboard" })).toBeEnabled();
    expectNoAxeViolations(await axe(container));
  });
});
