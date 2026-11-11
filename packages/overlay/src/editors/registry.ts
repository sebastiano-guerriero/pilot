import { borderEditor } from "./border/BorderEditor.tsx";
import { marginEditor } from "./margin/MarginEditor.tsx";
import { paddingEditor } from "./padding/PaddingEditor.tsx";
import { normalizeQuery } from "./query.ts";
import type { PropertyEditor } from "./types.ts";
import { maxWidthEditor, minWidthEditor, widthEditor } from "./width/WidthEditor.tsx";

/**
 * All built-in property editors. Each lives in `editors/<name>/` with its
 * component (.tsx) and styles (.css); register it here and import its CSS in
 * `ui/styles/index.css`.
 */
export const editors: PropertyEditor[] = [
  paddingEditor,
  marginEditor,
  borderEditor,
  widthEditor,
  minWidthEditor,
  maxWidthEditor,
];

/**
 * Rank editors for a search query, best first (hyphens and spaces ignored):
 * 4. exact alias (`pt` → padding)
 * 3. exact label or property name
 * 2. label/property starting with the query (`pad`, `padding-t`)
 * 1. label/property/keyword containing it
 * ½. abbreviations: the query's letters appear in order in a label/property,
 *    starting at a word start (`wdt` → width, `mxw` → max-width). Ranked last,
 *    so it only matters when nothing better matches; among several, the one
 *    skipping the fewest letters (then the shortest name) wins.
 */
export function searchEditors(query: string, list: PropertyEditor[] = editors): PropertyEditor[] {
  const q = normalizeQuery(query);
  if (!q) return list;
  return rank(q, list).map((x) => x.editor);
}

/** Most editors the dialog shows at once for one query. */
const MAX_SHOWN = 4;

/**
 * The editors the dialog shows for a query:
 * - every editor tied for the best match, if that match is a prefix or better
 *   (`min` → min-width and, later, min-height); a weaker, substring-only best
 *   match shows just the top one, so a single letter doesn't flood the dialog;
 * - plus, for each shown editor that heads a family, the family's members
 *   (`w` → width, min-width, max-width). Landing on a member directly
 *   (`min-w`) shows only that member.
 */
export function matchEditors(query: string, list: PropertyEditor[] = editors): PropertyEditor[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const ranked = rank(q, list);
  const best = ranked[0];
  if (!best) return [];
  const top = best.score >= 2 ? ranked.filter((x) => x.score === best.score).map((x) => x.editor) : [best.editor];
  const shown: PropertyEditor[] = [];
  for (const editor of top) {
    for (const e of [editor, ...list.filter((m) => m.family === editor.id)]) {
      if (!shown.includes(e)) shown.push(e);
    }
  }
  return shown.slice(0, MAX_SHOWN);
}

function rank(q: string, list: PropertyEditor[]): Array<{ editor: PropertyEditor; score: number; penalty: number }> {
  // `q` is already normalized; compare against normalized names too.
  const score = (e: PropertyEditor): number => {
    if (e.aliases?.some((a) => normalizeQuery(a) === q)) return 4;
    const names = [e.label, ...e.properties].map(normalizeQuery);
    if (names.some((n) => n === q)) return 3;
    if (names.some((n) => n.startsWith(q))) return 2;
    if (names.some((n) => n.includes(q)) || e.keywords?.some((k) => normalizeQuery(k).includes(q))) return 1;
    return 0;
  };
  const abbreviation = (e: PropertyEditor): number | null => {
    const penalties = [e.label, ...e.properties]
      .map((name) => {
        const skipped = abbreviationPenalty(q, name);
        return skipped === null ? null : skipped + name.length * 0.01; // shorter names win ties
      })
      .filter((p): p is number => p !== null);
    return penalties.length ? Math.min(...penalties) : null;
  };
  return list
    .map((editor) => {
      const s = score(editor);
      if (s > 0) return { editor, score: s, penalty: 0 };
      const p = abbreviation(editor);
      return { editor, score: p === null ? 0 : 0.5, penalty: p ?? 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.penalty - b.penalty);
}

const SEPARATOR = /[\s-]/;

/**
 * How many letters of `name` are skipped to find the query's letters in order,
 * starting at a word start (the beginning, or after a hyphen/space). Null when
 * the query isn't an abbreviation of `name`. `wdt` in "width" skips 1 (the i).
 */
export function abbreviationPenalty(q: string, name: string): number | null {
  const n = name.toLowerCase();
  let best: number | null = null;
  for (let start = 0; start < n.length; start++) {
    const wordStart = start === 0 || SEPARATOR.test(n[start - 1] as string);
    if (!wordStart || n[start] !== q[0]) continue;
    let matched = 1;
    let skipped = 0;
    for (let j = start + 1; j < n.length && matched < q.length; j++) {
      const ch = n[j] as string;
      if (SEPARATOR.test(ch)) continue;
      if (ch === q[matched]) matched++;
      else skipped++;
    }
    if (matched === q.length && (best === null || skipped < best)) best = skipped;
  }
  return best;
}
