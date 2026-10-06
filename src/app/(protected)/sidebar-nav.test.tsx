import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { SidebarNav, type SidebarNavProps } from "./sidebar-nav";

const router = { push: vi.fn(), refresh: vi.fn() };
let pathname = "/finance/transactions";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => router,
}));

const switchVaultAction = vi.fn();
vi.mock("@/modules/core/spaces/actions", () => ({
  switchVaultAction: (...args: unknown[]) => switchVaultAction(...args),
}));
vi.mock("@/modules/core/auth/actions", () => ({
  signOutAction: vi.fn(),
  signOutEverywhereAction: vi.fn(),
}));
// The palette pulls in the search Server Action; it isn't under test here.
vi.mock("./search-palette", () => ({ SearchPalette: () => null }));

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";

function props(overrides: Partial<SidebarNavProps> = {}): SidebarNavProps {
  return {
    user: { id: "u1", username: "asha", displayName: "Asha K", color: "#a2d2ff", hasAvatar: false },
    isAdmin: false,
    spaces: [
      { id: HOUSEHOLD, name: "Household", role: "editor", modules: ["house"], active: false },
    ],
    enabledModules: null,
    alertCount: 2,
    ...overrides,
  };
}

function desktopNav() {
  return screen.getByRole("navigation", { name: "Main" });
}

async function openSwitcher() {
  const trigger = within(desktopNav()).getByRole("button", { name: /Switch space/ });
  await act(async () => {
    fireEvent.click(trigger);
  });
  return screen.findByRole("menu");
}

describe("SidebarNav", () => {
  beforeEach(() => {
    pathname = "/finance/transactions";
    vi.clearAllMocks();
    switchVaultAction.mockResolvedValue({ ok: true, data: { spaceRole: "editor" } });
  });

  it("shows the user, the unread alert count and every module in the personal vault", () => {
    render(<SidebarNav {...props()} />);
    const nav = desktopNav();
    expect(within(nav).getByRole("button", { name: "Account menu for Asha K" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Security alerts (2 unread)" })).toHaveAttribute(
      "href",
      "/settings/security",
    );
    expect(within(nav).getByRole("link", { name: "Fashion" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("hides modules the active space hasn't enabled and shows Admin to admins", () => {
    render(
      <SidebarNav
        {...props({
          isAdmin: true,
          enabledModules: ["house"],
          spaces: [
            { id: HOUSEHOLD, name: "Household", role: "viewer", modules: ["house"], active: true },
          ],
        })}
      />,
    );
    const nav = desktopNav();
    expect(within(nav).getByRole("link", { name: "House" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Finance" })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    expect(
      within(nav).getByRole("button", { name: "Switch space (current: Household)" }),
    ).toBeTruthy();
  });

  it("lists Personal and each space with its role, and switches vaults", async () => {
    render(<SidebarNav {...props()} />);
    const menu = await openSwitcher();
    const options = within(menu).getAllByRole("menuitemradio");
    expect(options.map((o) => o.textContent)).toEqual(["Personal", "HouseholdEditor"]);
    expect(options[0]).toHaveAttribute("aria-checked", "true");

    await act(async () => {
      fireEvent.click(options[1]);
    });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(switchVaultAction).toHaveBeenCalledWith({ kind: "space", id: HOUSEHOLD });
    // Finance isn't part of Household, so the transactions page can't stay open.
    expect(router.push).toHaveBeenCalledWith("/dashboard");
  });

  it("shows a switching error as an alert", async () => {
    switchVaultAction.mockResolvedValue({ error: "That space doesn't exist." });
    render(<SidebarNav {...props()} />);
    const menu = await openSwitcher();
    await act(async () => {
      fireEvent.click(within(menu).getAllByRole("menuitemradio")[1]);
    });
    expect((await screen.findByRole("alert")).textContent).toBe("That space doesn't exist.");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("has no accessibility violations, closed or with the switcher open", async () => {
    const { container } = render(<SidebarNav {...props()} />);
    expectNoAxeViolations(await axe(container));
    const menu = await openSwitcher();
    // The popup is portaled to <body>, outside the page landmarks by design.
    expectNoAxeViolations(await axe(menu, { rules: { region: { enabled: false } } }));
  });
});
