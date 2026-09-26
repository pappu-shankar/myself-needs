import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DataTable, type DataTableColumnDef } from "./data-table";

interface DemoRow {
  id: number;
  date: string;
  name: string;
  amount: number;
}

const columns: DataTableColumnDef<DemoRow>[] = [
  { accessorKey: "date", header: "Date", meta: { width: "110px" } },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "amount",
    header: "Amount",
    meta: { align: "right", width: "120px" },
    cell: ({ row }) => row.original.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
  },
];

const data: DemoRow[] = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
  name: `Transaction ${i + 1}`,
  amount: (i + 1) * 137.5,
}));

// DataTable is generic over TData, which doesn't play well with Meta<typeof
// Component>'s inference — every story here uses `render` with concrete props
// instead of relying on `args`, sidestepping that entirely.
const meta = {
  title: "UI/DataTable",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Virtualized — only visible rows mount even with 40+ rows here (or tens of thousands in the real app). Scroll to see it in action. */
export const Default: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={data}
      emptyTitle="No transactions yet"
      emptyDescription="Add your first transaction above."
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={[]}
      emptyTitle="No transactions yet"
      emptyDescription="Add your first transaction above."
    />
  ),
};
