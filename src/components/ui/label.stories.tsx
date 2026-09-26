import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Label } from "./label";
import { Input } from "./input";

const meta = {
  title: "UI/Label",
  component: Label,
  parameters: { layout: "centered" },
  args: { children: "Label text" },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PairedWithInput: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-1.5">
      <Label htmlFor="story-input">Name</Label>
      <Input id="story-input" placeholder="Jane Doe" />
    </div>
  ),
};
