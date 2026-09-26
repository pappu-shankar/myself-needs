"use client";

import * as React from "react";
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { cn } from "@/lib/utils";

function Autocomplete({ ...props }: React.ComponentProps<typeof AutocompletePrimitive.Root>) {
  return <AutocompletePrimitive.Root data-slot="autocomplete" {...props} />;
}

function AutocompleteInput({ className, ...props }: AutocompletePrimitive.Input.Props) {
  return (
    <AutocompletePrimitive.Input
      data-slot="autocomplete-input"
      className={cn(
        "border-input bg-background flex h-10 w-full rounded-md border px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

function AutocompletePortal({ ...props }: AutocompletePrimitive.Portal.Props) {
  return <AutocompletePrimitive.Portal data-slot="autocomplete-portal" {...props} />;
}

function AutocompleteBackdrop({ className, ...props }: AutocompletePrimitive.Backdrop.Props) {
  return (
    <AutocompletePrimitive.Backdrop
      data-slot="autocomplete-backdrop"
      className={cn(
        "fixed inset-0 z-50 bg-black/20 duration-100 data-open:animate-in data-open:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function AutocompletePositioner({ className, ...props }: AutocompletePrimitive.Positioner.Props) {
  return (
    <AutocompletePrimitive.Positioner
      data-slot="autocomplete-positioner"
      className={cn("z-50", className)}
      sideOffset={8}
      {...props}
    />
  );
}

function AutocompletePopup({ className, ...props }: AutocompletePrimitive.Popup.Props) {
  return (
    <AutocompletePrimitive.Popup
      data-slot="autocomplete-popup"
      className={cn(
        "w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function AutocompleteList({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      data-slot="autocomplete-list"
      className={cn("flex max-h-96 flex-col gap-1 overflow-y-auto p-2", className)}
      {...props}
    />
  );
}

function AutocompleteGroup({ className, ...props }: AutocompletePrimitive.Group.Props) {
  return (
    <AutocompletePrimitive.Group
      data-slot="autocomplete-group"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

function AutocompleteGroupLabel({ className, ...props }: AutocompletePrimitive.GroupLabel.Props) {
  return (
    <AutocompletePrimitive.GroupLabel
      data-slot="autocomplete-group-label"
      className={cn(
        "text-muted-foreground px-2 pt-2 text-xs font-medium tracking-wide uppercase",
        className,
      )}
      {...props}
    />
  );
}

function AutocompleteItem({
  className,
  ...props
}: React.ComponentProps<typeof AutocompletePrimitive.Item>) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        "flex cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-sm data-highlighted:bg-muted data-highlighted:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function AutocompleteEmpty({ className, ...props }: AutocompletePrimitive.Empty.Props) {
  return (
    <AutocompletePrimitive.Empty
      data-slot="autocomplete-empty"
      className={cn("text-muted-foreground px-2.5 py-6 text-center text-sm", className)}
      {...props}
    />
  );
}

export {
  Autocomplete,
  AutocompleteInput,
  AutocompletePortal,
  AutocompleteBackdrop,
  AutocompletePositioner,
  AutocompletePopup,
  AutocompleteList,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteItem,
  AutocompleteEmpty,
};
