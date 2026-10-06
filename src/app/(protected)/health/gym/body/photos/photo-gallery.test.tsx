import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { PhotoGallery, type GalleryPhoto } from "./photo-gallery";

vi.mock("@/modules/health/actions/gym/progress-photos", () => ({
  deleteProgressPhotoAction: vi.fn(),
  updateProgressPhotoNoteAction: vi.fn(),
}));

const photos: GalleryPhoto[] = [
  {
    id: 2,
    date: "2026-10-04",
    pose: "front",
    width: 810,
    height: 1080,
    note: "Week 12",
    landmarks: null,
  },
  {
    id: 1,
    date: "2026-07-06",
    pose: "front",
    width: 810,
    height: 1080,
    note: null,
    landmarks: null,
  },
];

describe("PhotoGallery", () => {
  it("lists photos newest first with dates, notes and actions", async () => {
    const { container } = render(<PhotoGallery pose="front" photos={photos} total={3} />);
    const images = screen.getAllByRole("img");
    expect(images[0].getAttribute("alt")).toBe("Front progress photo, 4 Oct 2026");
    expect(images[0].getAttribute("src")).toBe("/api/health/progress-photos/2");
    expect(screen.getByText("Week 12")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Edit note for front photo from 4 Oct 2026/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Add note for front photo from 6 Jul 2026/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete front photo from 6 Jul 2026" })).toBeTruthy();
    expect(screen.getByText("Showing the newest 2 of 3.")).toBeTruthy();
    expectNoAxeViolations(await axe(container));
  });

  it("shows an empty state", async () => {
    const { container } = render(<PhotoGallery pose="side" photos={[]} total={0} />);
    expect(screen.getByText("No side photos yet")).toBeTruthy();
    expectNoAxeViolations(await axe(container));
  });
});
