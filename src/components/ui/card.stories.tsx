import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "./card";
import { Button } from "./button";

const meta = {
  title: "UI/Card",
  component: Card,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Total balance</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">₹1,24,500.00</p>
      </CardContent>
    </Card>
  ),
};

export const WithDescriptionActionAndFooter: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Emergency fund</CardTitle>
        <CardDescription>Target: ₹5,00,000 by Jan 2027</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">62% funded — on track.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm" className="w-full">
          Add contribution
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const SmallSize: Story = {
  render: () => (
    <Card size="sm" className="w-72">
      <CardHeader>
        <CardTitle>Compact card</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Tighter spacing via size=&quot;sm&quot;.</p>
      </CardContent>
    </Card>
  ),
};
