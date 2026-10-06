import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { dataUrlBytes, squareCrop } from "./avatar-resize";
import { ProfileForm } from "./profile-form";

vi.mock("@/modules/core/auth/account-actions", () => ({ updateProfileAction: vi.fn() }));

describe("ProfileForm", () => {
  it("prefills the display name and colour", () => {
    render(<ProfileForm displayName="Asha K" color="#a2d2ff" />);
    expect(screen.getByLabelText("Display name")).toHaveValue("Asha K");
    expect(screen.getByLabelText("Colour")).toHaveValue("#a2d2ff");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ProfileForm displayName={null} color={null} />);
    expectNoAxeViolations(await axe(container));
  });
});

describe("avatar resizing helpers", () => {
  it("centre-crops to a square no larger than 256", () => {
    expect(squareCrop(1000, 600)).toEqual({ sx: 200, sy: 0, side: 600, size: 256 });
    expect(squareCrop(100, 180)).toEqual({ sx: 0, sy: 40, side: 100, size: 100 });
  });

  it("measures the decoded size of a data URL", () => {
    expect(dataUrlBytes(`data:image/webp;base64,${btoa("abcd")}`)).toBe(4);
    expect(dataUrlBytes(`data:image/jpeg;base64,${btoa("abcde")}`)).toBe(5);
  });
});
