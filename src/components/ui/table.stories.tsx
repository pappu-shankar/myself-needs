import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./table";

const meta = {
  title: "UI/Table",
  component: Table,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const rows = [
  { name: "Emergency fund", priority: "Important", target: "2027-01-15", progress: "62%" },
  { name: "New laptop", priority: "Aspirational", target: "—", progress: "10%" },
  { name: "Retirement", priority: "Must have", target: "2050-01-01", progress: "8%" },
];

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Target date</TableHead>
          <TableHead className="text-right">Progress</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-muted-foreground">{r.priority}</TableCell>
            <TableCell className="tabular-nums">{r.target}</TableCell>
            <TableCell className="text-right tabular-nums">{r.progress}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const WithCaption: Story = {
  render: () => (
    <Table>
      <TableCaption>Goals sorted by priority.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Progress</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right tabular-nums">{r.progress}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

/** `Table` wraps in `overflow-x-auto` by default — narrow the viewport (or resize this frame) to see it scroll instead of clipping. */
export const NarrowContainerScrolls: Story = {
  render: () => (
    <div className="w-64">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Target date</TableHead>
            <TableHead className="text-right">Progress</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.name}>
              <TableCell>{r.name}</TableCell>
              <TableCell className="text-muted-foreground">{r.priority}</TableCell>
              <TableCell className="tabular-nums">{r.target}</TableCell>
              <TableCell className="text-right tabular-nums">{r.progress}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};
