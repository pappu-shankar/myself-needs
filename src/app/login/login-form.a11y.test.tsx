import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { AuthCard } from "@/app/(auth)/_components/auth-card";
import { LoginForm, type LoginProfile } from "./login-form";
import { RecoverForm } from "./recover/recover-form";

vi.mock("@/modules/core/auth/actions", () => ({
  loginAction: vi.fn(async () => ({})),
  recoverAction: vi.fn(async () => ({})),
}));

const PROFILES: LoginProfile[] = [
  { id: "a", username: "asha", displayName: "Asha", color: "#a2d2ff" },
  { id: "b", username: "ben", displayName: null, color: "#333333" },
  { id: "c", username: "chen", displayName: "Chen Li", color: null },
];

describe("login page accessibility", () => {
  it("has no violations with a plain username field", async () => {
    const { container } = render(
      <AuthCard title="Welcome back" description="Sign in with your username and password.">
        <LoginForm profiles={[]} />
      </AuthCard>,
    );
    expect(screen.getByLabelText("Username")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("link", { name: /use your recovery key/i })).toHaveAttribute(
      "href",
      "/login/recover",
    );
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations with the profile picker, and picking fills the username", async () => {
    const { container } = render(
      <AuthCard title="Welcome back">
        <LoginForm profiles={PROFILES} />
      </AuthCard>,
    );
    expect(screen.queryByLabelText("Username")).toBeNull();
    const ben = screen.getByRole("button", { name: "ben" });
    fireEvent.click(ben);
    expect(ben).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('input[name="username"]')).toHaveValue("ben");
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations on the recovery form", async () => {
    const { container } = render(
      <AuthCard title="Forgot your password?">
        <RecoverForm />
      </AuthCard>,
    );
    expectNoAxeViolations(await axe(container));
  });
});
