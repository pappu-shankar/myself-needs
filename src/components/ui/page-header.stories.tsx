import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageHeader } from "./page-header";
import { Button } from "./button";

const meta = {
  title: "UI/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
  args: {
    title: "Plans",
    description: "Financial and non-financial goals, sorted by priority.",
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TitleOnly: Story = {
  args: { title: "Dashboard", description: undefined },
};

export const WithActions: Story = {
  args: {
    title: "Investments",
    description: "Holdings, cash flows, valuations, and government scheme templates.",
    actions: <Button variant="outline">Back to Finance</Button>,
  },
};
