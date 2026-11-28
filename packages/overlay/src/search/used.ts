import { describeWidths, type ElementState, STATES, type WidthRange } from "@pilot/protocol";
import { mediaRange } from "../dom/breakpoints.ts";
import { conditionalRules, isUniversal, matchedRules, mediaOf, subjectStates } from "../dom/declared.ts";
import type { EditableElement } from "../dom/target.ts";
import { type Condition, conditionKey, conditionLabel } from "../edits/condition.ts";
import type { EditHistory } from "../edits/history.ts";
import { listedIds } from "../editors/listOrder.ts";
import { editors } from "../editors/registry.ts";
import { type PropertyEditor, propertiesOf } from "../editors/types.ts";
import type { Modifier } from "./modifiers.ts";

/**
 * The modifiers used on an element, for the `/` menu (the owner's call,
 * 2026-11-26): every states and width combination something sets a property
 * of it in, the project's rules (`.btn:hover`, `md:hover:bg-…`,
 * `@media (min-width: 768px)`) and Pilot's own changes, each with the
 * properties set there. So what's there is found without guessing: picked,
 * its pills are set, and the list shows what each sets.
 *
 * Read like the pills: a state is the element's own (`.card:hover .title`
 * isn't the title's), widths only from width conditions (and capabilities
 * true now: Tailwind v4's `hover:`), rules for every element (`*:focus`, a
 * reset) left out. The element as it is, with no modifier, isn't one.
 */
export function usedModifiers(element: EditableElement, history: EditHistory): Modifier[] {
  const found = new Map<string, { states: ElementState[]; widths?: WidthRange; condition?: Condition; properties: Set<string> }>();
  const add = (states: readonly ElementState[], widths: WidthRange | undefined, properties: Iterable<string>, condition?: Condition) => {
    if (!states.length && !widths && !condition) return;
    const sorted = STATES.filter((s) => states.includes(s));
    const key = `${sorted.join(",")}|${widths?.min ?? ""}-${widths?.max ?? ""}|${conditionKey(condition)}`;
    const entry = found.get(key) ?? { states: sorted, ...(widths && { widths }), ...(condition && { condition }), properties: new Set<string>() };
    for (const p of properties) if (!p.startsWith("--")) entry.properties.add(familyOf(p));
    if (entry.properties.size) found.set(key, entry);
  };

  for (const rule of matchedRules(element, { states: [], mode: "any" }, { anyMedia: true })) {
    if (isUniversal(subjectStates(rule.selector).stripped)) continue;
    const media = mediaOf(rule.style);
    const range = media ? mediaRange(media) : {};
    if (!range) continue;
    const widths = range.min === undefined && range.max === undefined ? undefined : range;
    // Its states as the walk read them: the scheme of a `prefers-color-scheme` query it sits in too.
    add(rule.states ?? [], widths, Array.from({ length: rule.style.length }, (_, i) => rule.style.item(i)));
  }
  // The project's own conditions on it (its code: `group-hover/hero`, `.card:hover &`), whether they hold now or not.
  for (const found of conditionalRules(element)) {
    const properties = found.rules.flatMap((r) => Array.from({ length: r.style.length }, (_, i) => r.style.item(i)));
    add([], undefined, properties, found.condition);
  }
  // Pilot's own changes, those under a condition too (named by the agent's label once it named it, else the words).
  for (const c of history.changes()) if (c.element === element && !c.removal) add(c.states ?? [], c.widths, [c.property], c.condition);

  return [...found.values()].sort(byPlace).map(({ states, widths, condition, properties }) => {
    const syntax = [...states.map((s) => `${s}:`), widths ? widthSyntax(widths) : ""].join("");
    return {
      id: `used:${syntax}|${conditionKey(condition)}`,
      name: [states.map(stateName).join(" + "), widths ? describeWidths(widths) : "", condition ? conditionLabel(condition) : ""].filter(Boolean).join(", "),
      description: inListOrder([...properties]).join(", "),
      syntax,
      insert: "",
      used: { states, ...(widths && { widths }), ...(condition && { condition }) },
    };
  });
}

/** States first (in STATES order), then widths from the narrowest up, then both together; conditions last. */
function byPlace(
  a: { states: ElementState[]; widths?: WidthRange; condition?: Condition },
  b: { states: ElementState[]; widths?: WidthRange; condition?: Condition },
): number {
  const kind = (m: typeof a) => (m.condition ? 3 : m.widths ? (m.states.length ? 2 : 1) : 0);
  if (kind(a) !== kind(b)) return kind(a) - kind(b);
  const w = (a.widths?.min ?? a.widths?.max ?? 0) - (b.widths?.min ?? b.widths?.max ?? 0);
  if (w) return w;
  return STATES.indexOf(a.states[0] as ElementState) - STATES.indexOf(b.states[0] as ElementState) || a.states.length - b.states.length;
}

function stateName(state: ElementState): string {
  const name = state.replace(/-/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** `from-768`, `to-767`, both for a range. */
function widthSyntax(widths: WidthRange): string {
  return [widths.min !== undefined ? `from-${widths.min}` : "", widths.max !== undefined ? `to-${widths.max}` : ""].filter(Boolean).join(" ");
}

/**
 * A longhand as the shorthand people set it with, where its parts are sides
 * or parts of one thing: padding-top → padding, border-top-left-radius →
 * border-radius, row-gap → gap. Others keep their name (font-size, flex-direction).
 */
const FAMILIES = ["padding", "margin", "inset", "border", "background", "outline", "transition", "animation", "mask", "overflow", "list-style"];
function familyOf(property: string): string {
  if (property.endsWith("-radius")) return "border-radius";
  if (property === "row-gap" || property === "column-gap") return "gap";
  return FAMILIES.find((f) => property === f || property.startsWith(`${f}-`)) ?? property;
}

/**
 * The properties in the dialog's own order (LIST_ORDER: layout, then
 * typography, appearance…), so the line reads like the list it leads to;
 * one no editor writes goes last, alphabetically. All of them: the menu cuts
 * the line where it ends (an ellipsis, PropertySearch.css).
 */
function inListOrder(properties: string[]): string[] {
  const rank = (p: string) => {
    const ranks = editorRanks();
    const own = ranks.get(p);
    if (own !== undefined) return own;
    // A family (`background`, `padding`): its first longhand an editor writes.
    let best = Number.POSITIVE_INFINITY;
    for (const [property, r] of ranks) if (property.startsWith(`${p}-`) && r < best) best = r;
    return best;
  };
  return [...properties].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

let ranks: Map<string, number> | null = null;
/** Each property an editor writes (and its id), at the editor's place in LIST_ORDER. */
function editorRanks(): Map<string, number> {
  if (ranks) return ranks;
  const order = listedIds();
  const out = new Map<string, number>();
  const visit = (editor: PropertyEditor) => {
    const i = order.indexOf(editor.id);
    if (i >= 0) for (const p of [editor.id, ...propertiesOf(editor)]) if ((out.get(p) ?? Number.POSITIVE_INFINITY) > i) out.set(p, i);
    for (const inner of editor.embeds ?? []) visit(inner);
  };
  for (const editor of editors) visit(editor);
  ranks = out;
  return out;
}
