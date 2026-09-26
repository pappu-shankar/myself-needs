"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { searchAction } from "./search-action";
import type { SearchResult } from "@/types/search";
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
} from "@/components/ui/autocomplete";

const TYPE_LABEL: Record<string, string> = {
  account: "Accounts",
  category: "Categories",
  transaction: "Transactions",
  recurring_rule: "Recurring rules",
  insurance: "Insurance",
  holding: "Investments",
  scheme_template: "Scheme templates",
  metric: "Health metrics",
  medication: "Medications",
  goal: "Goals",
  house_project: "House projects",
  room: "Rooms",
};

interface SearchGroup {
  label: string;
  items: SearchResult[];
}

function groupResults(results: SearchResult[]): SearchGroup[] {
  const byType = new Map<string, SearchResult[]>();
  for (const result of results) {
    const bucket = byType.get(result.type);
    if (bucket) bucket.push(result);
    else byType.set(result.type, [result]);
  }
  return Array.from(byType.entries()).map(([type, items]) => ({
    label: TYPE_LABEL[type] ?? type,
    items,
  }));
}

export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      searchAction(query).then(setResults);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  const groups = useMemo(() => groupResults(results), [results]);

  function goTo(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Autocomplete
      items={groups}
      open={open}
      onOpenChange={onOpenChange}
      value={query}
      onValueChange={setQuery}
    >
      <AutocompletePortal>
        <AutocompleteBackdrop />
        <AutocompletePositioner className="fixed top-[15%] left-1/2 -translate-x-1/2">
          <AutocompletePopup>
            <div className="border-b p-2">
              <AutocompleteInput placeholder="Search accounts, holdings, goals, medications…" />
            </div>
            <AutocompleteEmpty>
              {query.trim()
                ? "No results"
                : "Type to search across finance, health, mental, and plans"}
            </AutocompleteEmpty>
            <AutocompleteList>
              {(group: SearchGroup) => (
                <AutocompleteGroup key={group.label} items={group.items}>
                  <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
                  {group.items.map((item) => (
                    <AutocompleteItem
                      key={`${item.type}-${item.id}`}
                      value={item}
                      onClick={() => goTo(item.href)}
                    >
                      <span className="font-medium">{item.label}</span>
                      {item.subtitle && (
                        <span className="text-muted-foreground text-xs">{item.subtitle}</span>
                      )}
                    </AutocompleteItem>
                  ))}
                </AutocompleteGroup>
              )}
            </AutocompleteList>
          </AutocompletePopup>
        </AutocompletePositioner>
      </AutocompletePortal>
    </Autocomplete>
  );
}
