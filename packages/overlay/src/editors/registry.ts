import { paddingEditor } from "./padding/PaddingEditor.tsx";
import type { PropertyEditor } from "./types.ts";

/**
 * All built-in property editors. Each lives in `editors/<name>/` with its
 * component (.tsx) and styles (.css); register it here and import its CSS in
 * `ui/styles/index.css`.
 */
export const editors: PropertyEditor[] = [paddingEditor];

/**
 * Rank editors for a search query, best first:
 * 4. exact alias (`pt` → padding)
 * 3. exact label or property name
 * 2. label/property starting with the query (`pad`, `padding-t`)
 * 1. label/property/keyword containing it
 */
export function searchEditors(query: string, list: PropertyEditor[] = editors): PropertyEditor[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const score = (e: PropertyEditor): number => {
    if (e.aliases?.includes(q)) return 4;
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
