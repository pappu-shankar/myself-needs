import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NavCard } from "./nav-card";

const meta = {
  title: "UI/NavCard",
  component: NavCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof NavCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: "#",
    title: "Accounts",
    description: "Checking, savings, cash, credit cards, loans",
  },
};

export const WithoutDescription: Story = {
  args: { href: "#", title: "Debts" },
};

export const List: Story = {
  args: { href: "#", title: "Accounts" },
  render: () => (
    <div className="flex max-w-sm flex-col gap-2">
      <NavCard
        href="#"
        title="Accounts"
        description="Checking, savings, cash, credit cards, loans"
      />
      <NavCard href="#" title="Categories" description="Income and expense categories" />
      <NavCard href="#" title="Transactions" description="Log income, expenses, and transfers" />
      <NavCard href="#" title="Budgets" description="Monthly limits per category" />
    </div>
  ),
};
