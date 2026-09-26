"use server";

import { searchFinance } from "@/modules/finance";
import { searchHealth } from "@/modules/health";
import { searchMental } from "@/modules/mental";
import { searchPlans } from "@/modules/plans";
import { searchHouse } from "@/modules/house";
import type { SearchResult } from "@/types/search";

export async function searchAction(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  return [
    ...searchFinance(query),
    ...searchHealth(query),
    ...searchMental(query),
    ...searchPlans(query),
    ...searchHouse(query),
  ];
}
