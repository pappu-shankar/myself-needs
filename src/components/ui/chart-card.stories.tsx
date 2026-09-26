import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ChartCard, type ChartTableColumn } from "./chart-card";

interface AllocationRow {
  category: string;
  percent: number;
}

const data: AllocationRow[] = [
  { category: "Equity", percent: 55 },
  { category: "Debt", percent: 30 },
  { category: "Gold", percent: 15 },
];

const columns: ChartTableColumn<AllocationRow>[] = [
  { key: "category", label: "Category", render: (r) => r.category },
  { key: "percent", label: "Allocation", align: "right", render: (r) => `${r.percent}%` },
];

/** A placeholder "chart" — the real app uses Recharts here. ChartCard itself doesn't care what `children` renders. */
function PlaceholderChart() {
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((row) => (
        <div key={row.category} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="bg-primary w-full rounded-t"
            style={{ height: `${row.percent * 1.4}px` }}
          />
          <span className="text-muted-foreground text-xs">{row.category}</span>
        </div>
      ))}
    </div>
  );
}

// ChartCard is generic over T; every story below uses `render` with concrete
// props, so meta is left untyped to `component` rather than fighting generic inference.
const meta = {
  title: "UI/ChartCard",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Click "View as table" — every chart in this app gets this accessible text-alternative for free. */
export const WithData: Story = {
  render: () => (
    <div className="w-96">
      <ChartCard
        title="Allocation breakdown"
        description="By asset class"
        tableData={data}
        tableColumns={columns}
      >
        <PlaceholderChart />
      </ChartCard>
    </div>
  ),
};

export const NoData: Story = {
  render: () => (
    <div className="w-96">
      <ChartCard
        title="Allocation breakdown"
        tableData={[]}
        tableColumns={columns}
        emptyDescription="Add a holding to see your allocation."
      >
        <PlaceholderChart />
      </ChartCard>
    </div>
  ),
};
