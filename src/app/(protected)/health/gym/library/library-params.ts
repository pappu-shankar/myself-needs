import { MUSCLES, type Muscle } from "@/modules/health/types";

export const LIBRARY_PAGE_SIZE = 50;
const MAX_PAGE = 10_000;

export interface LibraryFilters {
  q: string;
  bodyPart: string;
  equipment: string;
  muscle: Muscle | null;
  favorites: boolean;
  owned: boolean;
  archived: boolean;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

const isOn = (value: string) => value === "1" || value === "on" || value === "true";

/** Search params → validated filters; anything malformed falls back to "no filter". */
export function parseLibraryParams(raw: RawParams): LibraryFilters {
  const muscle = first(raw.muscle);
  const page = Number.parseInt(first(raw.page), 10);
  return {
    q: first(raw.q).slice(0, 100),
    bodyPart: first(raw.bodyPart).toLowerCase().slice(0, 60),
    equipment: first(raw.equipment).toLowerCase().slice(0, 60),
    muscle: (MUSCLES as readonly string[]).includes(muscle) ? (muscle as Muscle) : null,
    favorites: isOn(first(raw.favorites)),
    owned: isOn(first(raw.owned)),
    archived: isOn(first(raw.archived)),
    page: Number.isFinite(page) && page > 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** Link back to the library with `filters` (optionally overridden); defaults are omitted. */
export function libraryHref(filters: LibraryFilters, overrides: Partial<LibraryFilters> = {}) {
  const f = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.bodyPart) params.set("bodyPart", f.bodyPart);
  if (f.equipment) params.set("equipment", f.equipment);
  if (f.muscle) params.set("muscle", f.muscle);
  if (f.favorites) params.set("favorites", "1");
  if (f.owned) params.set("owned", "1");
  if (f.archived) params.set("archived", "1");
  if (f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `/health/gym/library?${qs}` : "/health/gym/library";
}

/** Sentence-case a dataset term ("upper arms" → "Upper arms"). */
export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** 1-based "first–last of total" range for a page. */
export function pageRange(page: number, pageSize: number, total: number) {
  if (total === 0) return { from: 0, to: 0, pages: 1 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(total, page * pageSize), pages: Math.ceil(total / pageSize) };
}
