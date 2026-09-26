import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Heart } from "lucide-react";
import { EmptyState } from "./empty-state";
import { Button } from "./button";

const meta = {
  title: "UI/EmptyState",
  component: EmptyState,
  parameters: { layout: "centered" },
  args: {
    title: "No goals yet",
    description: "Add your first goal above to start tracking.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="w-96">
      <EmptyState {...args} />
    </div>
  ),
};

export const TitleOnly: Story = {
  render: () => (
    <div className="w-96">
      <EmptyState title="Nothing here yet" />
    </div>
  ),
};

export const CustomIconAndAction: Story = {
  render: () => (
    <div className="w-96">
      <EmptyState
        title="No favorites yet"
        description="Mark something as a favorite to see it here."
        icon={Heart}
        action={<Button size="sm">Browse</Button>}
      />
    </div>
  ),
};
