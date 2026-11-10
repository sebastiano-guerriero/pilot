import type { PropertyEditor } from "./types.ts";

/** All built-in property editors. Empty for now: editors are added one by one. */
export const editors: PropertyEditor[] = [];

/** Rank editors for a search query: exact/prefix matches on label or property first, then keywords. */
export function searchEditors(query: string, list: PropertyEditor[] = editors): PropertyEditor[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const score = (e: PropertyEditor): number => {
    const names = [e.label.toLowerCase(), ...e.properties];
    if (names.some((n) => n === q)) return 3;
    if (names.some((n) => n.startsWith(q))) return 2;
    if (names.some((n) => n.includes(q)) || e.keywords?.some((k) => k.includes(q))) return 1;
    return 0;
  };
  return list
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);
}
