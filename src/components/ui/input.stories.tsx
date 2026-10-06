import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: { layout: "centered" },
  args: {
    placeholder: "Type something…",
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="w-64">
      <Input {...args} />
    </div>
  ),
};

export const WithValue: Story = {
  render: (args) => (
    <div className="w-64">
      <Input {...args} defaultValue="Existing value" />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="w-64">
      <Input {...args} disabled defaultValue="Can't edit this" />
    </div>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <div className="w-64">
      <Input {...args} aria-invalid defaultValue="Bad value" />
    </div>
  ),
};

export const Types: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-3">
      <Input type="text" placeholder="Text" />
      <Input type="number" placeholder="Number" />
      <Input type="date" />
      <Input type="password" defaultValue="secret" />
    </div>
  ),
};

/** Mirrors `PassphraseInput` (src/app/unlock) — the `trailingIcon` slot exists specifically for this. */
export const WithTrailingIconPasswordToggle: Story = {
  render: () => {
    function Demo() {
      const [visible, setVisible] = useState(false);
      return (
        <div className="w-64">
          <Input
            type={visible ? "text" : "password"}
            defaultValue="my-passphrase"
            trailingIcon={
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Hide password" : "Show password"}
                className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
        </div>
      );
    }
    return <Demo />;
  },
};
