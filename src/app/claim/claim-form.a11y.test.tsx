import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { SetupForm } from "@/app/setup/setup-form";
import { ClaimForm } from "./claim-form";

vi.mock("@/modules/core/auth/actions", () => ({
  claimAction: vi.fn(async () => ({})),
  setupAction: vi.fn(async () => ({})),
  acknowledgeRecoveryKeyAction: vi.fn(async () => {}),
}));

describe("claim page accessibility", () => {
  it("has no violations with the passphrase kept", async () => {
    const { container } = render(
      <AuthCard title="Claim your data">
        <ClaimForm />
      </AuthCard>,
    );
    expect(screen.getByLabelText("Current passphrase")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.queryByLabelText("New password")).toBeNull();
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations when also choosing a new password", async () => {
    const { container } = render(
      <AuthCard title="Claim your data">
        <ClaimForm />
      </AuthCard>,
    );
    fireEvent.click(screen.getByLabelText(/Also choose a new password/));
    const next = screen.getByLabelText("New password");
    expect(next).toHaveAttribute("name", "newPassword");
    fireEvent.change(next, { target: { value: "short" } });
    expect(screen.getByText(/7 more characters needed/)).toBeInTheDocument();
    expectNoAxeViolations(await axe(container));
  });
});

describe("setup page accessibility", () => {
  it("has no violations", async () => {
    const { container } = render(
      <AuthCard title="Create the admin account">
        <SetupForm />
      </AuthCard>,
    );
    expectNoAxeViolations(await axe(container));
  });
});
