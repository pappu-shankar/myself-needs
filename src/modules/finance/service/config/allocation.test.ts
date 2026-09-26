import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getFinanceSettings, setDateOfBirth, dismissGettingStartedChecklist } from "./allocation";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("finance settings", () => {
  it("round-trips the date of birth", () => {
    expect(getFinanceSettings()).toBeNull();

    setDateOfBirth("1990-06-20");
    expect(getFinanceSettings()).toMatchObject({ dateOfBirth: "1990-06-20" });

    setDateOfBirth(null);
    expect(getFinanceSettings()).toMatchObject({ dateOfBirth: null });
  });

  it("getting-started checklist defaults to not dismissed, and stays dismissed once skipped", () => {
    expect(getFinanceSettings()?.gettingStartedDismissed).toBeFalsy();

    dismissGettingStartedChecklist();

    expect(getFinanceSettings()).toMatchObject({ gettingStartedDismissed: true });
  });

  it("dismissing the checklist doesn't clobber a date of birth set beforehand", () => {
    setDateOfBirth("1990-06-20");

    dismissGettingStartedChecklist();

    expect(getFinanceSettings()).toMatchObject({
      dateOfBirth: "1990-06-20",
      gettingStartedDismissed: true,
    });
  });
});
