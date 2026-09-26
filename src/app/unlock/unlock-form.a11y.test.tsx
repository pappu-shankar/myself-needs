import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { expectNoAxeViolations } from "@/test/a11y";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnlockForm } from "./unlock-form";
import { RecoveryKeyForm } from "./recovery-key-form";
import { RecoveryKeyReveal } from "./recovery-key-reveal";
import { ResetPassphraseForm } from "./reset-passphrase-form";

function renderUnlockPage(isFirstRun: boolean) {
  return render(
    <main>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            {isFirstRun ? "Set up your vault" : "Welcome back"}
          </CardTitle>
          <CardDescription>
            {isFirstRun
              ? "Your data will be encrypted with this passphrase. Choose something you won't forget."
              : "Enter your passphrase to unlock your data."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnlockForm isFirstRun={isFirstRun} />
        </CardContent>
      </Card>
    </main>,
  );
}

describe("unlock page accessibility", () => {
  it("has no violations on return-visit unlock", async () => {
    const { container } = renderUnlockPage(false);
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations on first-run vault setup", async () => {
    const { container } = renderUnlockPage(true);
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations on the recovery key entry form", async () => {
    const { container } = render(
      <main>
        <RecoveryKeyForm
          state={{}}
          formAction={() => {}}
          isPending={false}
          recoveryKeyValue=""
          onRecoveryKeyChange={() => {}}
          onBack={() => {}}
        />
      </main>,
    );
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations on the recovery key reveal screen", async () => {
    const { container } = render(
      <main>
        <RecoveryKeyReveal recoveryKey="a1b2c3d4-e5f6a7b8-c9d0e1f2-a3b4c5d6" />
      </main>,
    );
    expectNoAxeViolations(await axe(container));
  });

  it("has no violations on the reset-passphrase form", async () => {
    const { container } = render(
      <main>
        <ResetPassphraseForm
          recoveryKey="a1b2c3d4-e5f6a7b8-c9d0e1f2-a3b4c5d6"
          state={{}}
          formAction={() => {}}
          isPending={false}
        />
      </main>,
    );
    expectNoAxeViolations(await axe(container));
  });
});
