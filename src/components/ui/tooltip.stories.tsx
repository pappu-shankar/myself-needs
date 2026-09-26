import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";
import { Button } from "./button";

// TooltipProvider is applied globally via .storybook/preview.tsx, mirroring src/app/layout.tsx.

const meta = {
  title: "UI/Tooltip",
  component: Tooltip,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger render={<Button variant="outline">Hover me</Button>} />
      <TooltipContent>Refresh NAV</TooltipContent>
    </Tooltip>
  ),
};

export const Sides: Story = {
  render: () => (
    <div className="flex gap-8 p-12">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Tooltip key={side} defaultOpen>
          <TooltipTrigger render={<Button variant="outline">{side}</Button>} />
          <TooltipContent side={side}>On the {side}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  ),
};
