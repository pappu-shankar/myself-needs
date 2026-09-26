import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./dialog";
import { Button } from "./button";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button>Open dialog</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this goal?</DialogTitle>
          <DialogDescription>This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const OpenByDefault: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger render={<Button>Open dialog</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save your recovery key</DialogTitle>
          <DialogDescription>It will never be shown again.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const NoCloseButton: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger render={<Button>Open dialog</Button>} />
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>No X button</DialogTitle>
          <DialogDescription>
            For flows that must be explicitly acknowledged via a footer action.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button>Acknowledge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
