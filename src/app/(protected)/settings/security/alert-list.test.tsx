import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { AlertList, type AlertRow } from "./alert-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const dismissAlertAction = vi.fn();
vi.mock("@/modules/core/auth/account-actions", () => ({
  dismissAlertAction: (...args: unknown[]) => dismissAlertAction(...args),
}));

const alerts: AlertRow[] = [
  {
    id: "failed:9",
    severity: "warning",
    title: "Failed sign-in attempts",
    message: "6 wrong-password attempts on your account in the last 24 hours.",
    when: "5 Oct 2026, 9:00 am",
  },
  {
    id: "device:4",
    severity: "info",
    title: "New device signed in",
    message: "Your account was signed in from a new device (Firefox on Linux).",
    when: "4 Oct 2026, 8:00 pm",
  },
];

describe("AlertList", () => {
  beforeEach(() => {
    dismissAlertAction.mockReset();
  });

  it("dismisses an alert and hides it", async () => {
    dismissAlertAction.mockResolvedValue({ ok: true });
    render(<AlertList alerts={alerts} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: 'Dismiss "New device signed in"' }));
    });
    expect(dismissAlertAction).toHaveBeenCalledWith({ alertId: "device:4" });
    expect(screen.queryByText("New device signed in")).toBeNull();
    expect(screen.getByText("Failed sign-in attempts")).toBeTruthy();
  });

  it("keeps the alert and announces the error when dismissing fails", async () => {
    dismissAlertAction.mockResolvedValue({ error: "Something went wrong." });
    render(<AlertList alerts={alerts} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: 'Dismiss "Failed sign-in attempts"' }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong.");
    expect(screen.getByText("Failed sign-in attempts")).toBeTruthy();
  });

  it("says so when there are no alerts", () => {
    render(<AlertList alerts={[]} />);
    expect(screen.getByRole("status").textContent).toMatch(/No security alerts/);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<AlertList alerts={alerts} />);
    expectNoAxeViolations(await axe(container));
  });
});
