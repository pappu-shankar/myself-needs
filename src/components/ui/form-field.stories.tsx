import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FormField, FormFieldAction } from "./form-field";
import { Input } from "./input";
import { Button } from "./button";

// Every story below uses `render` with concrete props, so `component` is
// omitted from meta rather than requiring meta-level `args` for FormField's
// required `label`/`htmlFor` props.
const meta = {
  title: "UI/FormField",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-72">
      <FormField label="Name" htmlFor="ff-name">
        <Input id="ff-name" placeholder="Jane Doe" />
      </FormField>
    </div>
  ),
};

export const WithHint: Story = {
  render: () => (
    <div className="w-72">
      <FormField label="Target date" htmlFor="ff-date" hint="Optional">
        <Input id="ff-date" type="date" />
      </FormField>
    </div>
  ),
};

export const WithError: Story = {
  render: () => (
    <div className="w-72">
      <FormField label="Amount" htmlFor="ff-amount" error="Must be greater than zero">
        <Input id="ff-amount" type="number" defaultValue={-5} />
      </FormField>
    </div>
  ),
};

/**
 * `FormFieldAction` renders an invisible copy of the real label so a submit
 * button (or checkbox — see the two 80C/80D examples in insurance-form.tsx)
 * lines up with the *inputs* in an `items-start` grid row, not the row's top
 * edge. This is the exact fix applied across every form in the app after the
 * button/checkbox alignment bugs.
 */
export const RowWithMixedHintsAndAction: Story = {
  name: "Row with mixed hints + FormFieldAction (the alignment fix)",
  render: () => (
    <form className="grid grid-cols-4 items-start gap-4">
      <FormField label="Name" htmlFor="ff-row-name">
        <Input id="ff-row-name" placeholder="Emergency fund" />
      </FormField>
      <FormField label="Priority" htmlFor="ff-row-priority">
        <select
          id="ff-row-priority"
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          <option>Important</option>
        </select>
      </FormField>
      <FormField label="Target date" htmlFor="ff-row-date" hint="Optional">
        <Input id="ff-row-date" type="date" />
      </FormField>
      <FormFieldAction label="Add goal">
        <Button type="submit">Add goal</Button>
      </FormFieldAction>
    </form>
  ),
};
