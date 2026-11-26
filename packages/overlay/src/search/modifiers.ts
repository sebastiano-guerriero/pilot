import type { ElementState } from "@pilot/protocol";
import { normalizeQuery } from "../editors/query.ts";

/**
 * Search modifiers: what the `/` menu offers in the search field. A modifier
 * changes what the next changes are for (some viewport widths, element states), and
 * shows as a pill above the field. The menu is how they're discovered: each
 * row says what the modifier does and the syntax it stands for, so next time
 * it can be typed directly (`from-1280 `).
 *
 * Add one entry per modifier (hover, focus, `*`, group-checked… later). What
 * a modifier does once its pill is set (the preview, the prompt's wording)
 * is up to its own code: here is only how it's found and started.
 */
export interface Modifier {
  id: string;
  /** The row's name: "From width". */
  name: string;
  /** What it does, in a few words. */
  description: string;
  /** The syntax it stands for, shown on the row: `from-768`. */
  syntax: string;
  /**
   * What picking it puts in the search, to finish typing: `from-` (the
   * window's width then shows dimmed after it, and Tab takes it).
   */
  insert: string;
  /** For a state: picking it sets the pill right away (nothing left to type). */
  state?: ElementState;
  /** For Base and All widths: picking it sets the width chip right away. */
  chip?: "base" | "all";
}

export const MODIFIERS: Modifier[] = [
  {
    id: "from-width",
    name: "From width",
    description: "This viewport width and up",
    syntax: "from-768",
    insert: "from-",
  },
  {
    id: "to-width",
    name: "To width",
    description: "Up to this viewport width",
    syntax: "to-767",
    insert: "to-",
  },
  { id: "base", name: "Base", description: "The value without a breakpoint", syntax: "base", insert: "base ", chip: "base" },
  {
    id: "all-widths",
    name: "All widths",
    description: "One value, breakpoints removed",
    syntax: "all-widths",
    insert: "all-widths ",
    chip: "all",
  },
  { id: "hover", name: "Hover", description: "The pointer is over it", syntax: "hover:", insert: "hover:", state: "hover" },
  { id: "focus", name: "Focus", description: "It has focus", syntax: "focus:", insert: "focus:", state: "focus" },
  {
    id: "focus-visible",
    name: "Focus visible",
    description: "Focused from the keyboard",
    syntax: "focus-visible:",
    insert: "focus-visible:",
    state: "focus-visible",
  },
  { id: "active", name: "Active", description: "Being pressed", syntax: "active:", insert: "active:", state: "active" },
];

/** The search text opens the menu: it starts with `/` (no property does). */
export function isModifierQuery(text: string): boolean {
  return text.startsWith("/");
}

/**
 * The modifiers matching what's typed after the `/`, in list order: all of
 * them for nothing; else those whose name (any word) or syntax starts with it
 * (`/fr` → From width, `/to` → To width, `/w` → both).
 */
export function matchModifiers(text: string, list: Modifier[] = MODIFIERS): Modifier[] {
  const q = normalizeQuery(text.replace(/^\//, ""));
  if (!q) return list;
  return list.filter((m) => {
    const words = [m.name, ...m.name.split(/\s+/), m.syntax].map(normalizeQuery);
    return words.some((w) => w.startsWith(q));
  });
}
