import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import {
  Autocomplete,
  AutocompleteBackdrop,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
  AutocompletePositioner,
  AutocompletePortal,
} from "./autocomplete";

const meta = {
  title: "UI/Autocomplete",
  component: Autocomplete,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Autocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = ["Emergency fund", "Retirement", "New laptop", "House down payment", "Vacation fund"];

/** Modeled after the app's ⌘K search palette — open by default here so it's visible without an interaction. */
export const Default: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(true);
      const [value, setValue] = useState("");
      return (
        <div className="relative h-64 w-96">
          <Autocomplete
            items={items}
            open={open}
            onOpenChange={setOpen}
            value={value}
            onValueChange={setValue}
          >
            <AutocompleteInput placeholder="Search goals…" className="mb-2" />
            <AutocompletePortal>
              <AutocompleteBackdrop />
              <AutocompletePositioner className="top-[15%]" sideOffset={0}>
                <AutocompletePopup>
                  <AutocompleteEmpty>No results</AutocompleteEmpty>
                  <AutocompleteList>
                    {(item: string) => (
                      <AutocompleteItem key={item} value={item}>
                        {item}
                      </AutocompleteItem>
                    )}
                  </AutocompleteList>
                </AutocompletePopup>
              </AutocompletePositioner>
            </AutocompletePortal>
          </Autocomplete>
        </div>
      );
    }
    return <Demo />;
  },
};

interface Group {
  label: string;
  items: string[];
}

const groups: Group[] = [
  { label: "Goals", items: ["Emergency fund", "Retirement"] },
  { label: "Accounts", items: ["HDFC Savings", "SBI Salary"] },
];

export const Grouped: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(true);
      const [value, setValue] = useState("");
      return (
        <div className="relative h-64 w-96">
          <Autocomplete
            items={groups}
            open={open}
            onOpenChange={setOpen}
            value={value}
            onValueChange={setValue}
          >
            <AutocompleteInput placeholder="Search accounts, goals…" className="mb-2" />
            <AutocompletePortal>
              <AutocompleteBackdrop />
              <AutocompletePositioner className="top-[15%]" sideOffset={0}>
                <AutocompletePopup>
                  <AutocompleteEmpty>No results</AutocompleteEmpty>
                  <AutocompleteList>
                    {(group: Group) => (
                      <AutocompleteGroup key={group.label} items={group.items}>
                        <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
                        {group.items.map((item) => (
                          <AutocompleteItem key={item} value={item}>
                            {item}
                          </AutocompleteItem>
                        ))}
                      </AutocompleteGroup>
                    )}
                  </AutocompleteList>
                </AutocompletePopup>
              </AutocompletePositioner>
            </AutocompletePortal>
          </Autocomplete>
        </div>
      );
    }
    return <Demo />;
  },
};
