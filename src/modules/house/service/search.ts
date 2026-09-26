import type { SearchResult } from "@/types/search";
import { searchProjectsByName, searchRoomsByName } from "../db/queries/search";

export function searchHouse(query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const projects: SearchResult[] = searchProjectsByName(trimmed).map((p) => ({
    type: "house_project",
    id: p.id,
    label: p.name,
    href: "/house",
  }));

  const rooms: SearchResult[] = searchRoomsByName(trimmed).map((r) => ({
    type: "room",
    id: r.id,
    label: r.name,
    subtitle: r.type,
    href: "/house",
  }));

  return [...projects, ...rooms];
}
