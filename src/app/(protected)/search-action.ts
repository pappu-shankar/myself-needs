"use server";

import { searchFinance } from "@/modules/finance";
import { searchHealth } from "@/modules/health";
import { searchMental } from "@/modules/mental";
import { searchPlans } from "@/modules/plans";
import { searchHouse } from "@/modules/house";
import type { SearchResult } from "@/types/search";
import { requireUnlocked } from "@/modules/core/session/guard";

export async function searchAction(query: string): Promise<SearchResult[]> {
  await requireUnlocked();
  if (!query.trim()) return [];

  return [
    ...searchFinance(query),
    ...searchHealth(query),
    ...searchMental(query),
    ...searchPlans(query),
    ...searchHouse(query),
  ];
}
