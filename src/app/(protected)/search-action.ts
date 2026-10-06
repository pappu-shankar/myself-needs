"use server";

import { searchFinance } from "@/modules/finance";
import { searchHealth } from "@/modules/health";
import { searchMental } from "@/modules/mental";
import { searchPlans } from "@/modules/plans";
import { searchHouse } from "@/modules/house";
import type { SearchResult } from "@/types/search";
import { withUser } from "@/modules/core/session/guard";

/** Read-only, so space viewers may search too. */
export async function searchAction(query: string): Promise<SearchResult[]> {
  return await withUser(() => {
    if (!query.trim()) return [];

    return [
      ...searchFinance(query),
      ...searchHealth(query),
      ...searchMental(query),
      ...searchPlans(query),
      ...searchHouse(query),
    ];
  });
}
