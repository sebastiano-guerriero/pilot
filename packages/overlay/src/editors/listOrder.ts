import type { PropertyEditor } from "./types.ts";

/**
 * The order of the properties in the dialog's list when nothing is typed in
 * the search (the element's set properties), by editor id, in groups. Kept by
 * the project owner: update it with every new editor (a test fails for an
 * editor that can be listed but has no place here, editors/listOrder.test.ts).
 *
 * An entry can show other editors as rows below it, per value of its
 * property: display shows the grid rows for grid (and inline-grid), the flex
 * rows for flex (and inline-flex); `*` sets rows for any value, and for
 * none (position always shows inset). Their order is set here too. When one of
 * them shows on its own (gap on an element that isn't a grid), it's listed
 * right after the entry that would show it.
 */
export type ListEntry = string | { id: string; rows: Readonly<Record<string, readonly string[]>> };

export const LIST_ORDER: ReadonlyArray<{ group: string; entries: readonly ListEntry[] }> = [
  {
    group: "Layout",
    entries: [
      {
        id: "display",
        rows: {
          grid: ["grid-columns", "gap", "justify-content", "align-items"],
          flex: ["flex-direction", "flex-wrap", "gap", "justify-content", "align-items"],
        },
      },
      "width",
      "min-width",
      "max-width",
      "height",
      "min-height",
      "max-height",
      "aspect-ratio",
      "padding",
      "margin",
      "overflow",
      "order",
      // a flex item's share of the space
      "flex-grow",
      "flex-shrink",
      "flex-basis",
      // a grid item's place on its parent's columns
      "grid-column",
      "grid-column-start",
      "grid-column-end",
      "object-fit",
    ],
  },
  {
    group: "Position",
    entries: [
      // `*`: rows for every value, and for none.
      { id: "position", rows: { "*": ["inset"] } },
      "z-index",
      "isolation",
    ],
  },
  {
    group: "Appearance",
    entries: ["background-color", "border-radius", "opacity"],
  },
  {
    group: "Typography",
    entries: ["color", "font-family", "font-size", "font-style", "font-weight", "line-height", "letter-spacing", "text-align"],
  },
  {
    // What's drawn of the element (mask, clip-path… will join it).
    group: "Visibility",
    entries: ["visibility"],
  },
];

/** The rows an entry shows for a value of its property, by editor id (`display`, `inline-grid` → grid's). */
export function rowsOf(id: string, value: string): readonly string[] {
  const entry = LIST_ORDER.flatMap((g) => g.entries).find((e) => typeof e !== "string" && e.id === id);
  if (!entry || typeof entry === "string") return [];
  const key = value.replace(/^inline-/, "");
  return entry.rows[key] ?? entry.rows["*"] ?? [];
}

/** Every id in list order: each entry, then its rows (once each). */
export function listedIds(): string[] {
  const ids: string[] = [];
  for (const entry of LIST_ORDER.flatMap((g) => g.entries)) {
    if (typeof entry === "string") ids.push(entry);
    else ids.push(entry.id, ...Object.values(entry.rows).flat());
  }
  return [...new Set(ids)];
}

const position = new Map(listedIds().map((id, i) => [id, i]));

/** The group an editor is listed in (`Layout`), its rows included; undefined when it has no place. */
export function groupOf(id: string): string | undefined {
  for (const { group, entries } of LIST_ORDER) {
    for (const entry of entries) {
      if (entry === id) return group;
      if (typeof entry !== "string" && (entry.id === id || Object.values(entry.rows).some((r) => r.includes(id)))) {
        return group;
      }
    }
  }
  return undefined;
}

/**
 * `editors` in LIST_ORDER. One with no place (a missing entry, caught by the
 * test) goes last, in the order given.
 */
export function inListOrder(editors: PropertyEditor[]): PropertyEditor[] {
  const at = (e: PropertyEditor) => position.get(e.id) ?? Number.POSITIVE_INFINITY;
  return editors
    .map((editor, i) => ({ editor, i }))
    .sort((a, b) => at(a.editor) - at(b.editor) || a.i - b.i)
    .map((x) => x.editor);
}
