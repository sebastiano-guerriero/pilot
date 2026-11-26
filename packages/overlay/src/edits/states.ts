import { type ElementState, STATES, isColorScheme, isPseudoElement, sortStates } from "@pilot/protocol";

/**
 * The state pills: which element states the designer's changes are for, all
 * together (hover and active: hovered and pressed). Set by typing Tailwind's
 * variant at the start of the search (`hover:`, `focus-visible:`) or from the
 * `/` menu. No pill: the element as it is.
 */

/** `hover:`, `focus-visible:`… (the colon ends it, as Tailwind writes them). */
const TOKEN = new RegExp(`^\\s*(${[...STATES].sort((a, b) => b.length - a.length).join("|")}):`, "i");

/**
 * Take the state tokens off the start of the search text: `hover:active:bg`
 * → hover and active (added to `current`) and the query `bg`. `states` is
 * null when the text starts with none (it's all search).
 */
export function takeStates(text: string, current: readonly ElementState[]): { states: ElementState[] | null; rest: string } {
  let states: ElementState[] | null = null;
  let rest = text;
  for (let match = TOKEN.exec(rest); match; match = TOKEN.exec(rest)) {
    states = withState(states ?? current, (match[1] as string).toLowerCase() as ElementState);
    rest = rest.slice(match[0].length);
  }
  return { states, rest };
}

/**
 * The states with one added. One color scheme and one pseudo-element at a
 * time: `light` replaces `dark` (a rule can't be for both), `after` replaces
 * `before`.
 */
export function withState(states: readonly ElementState[], state: ElementState): ElementState[] {
  const kind = (s: ElementState) => (isColorScheme(s) ? "scheme" : isPseudoElement(s) ? "pseudo" : s);
  return sortStates([...states.filter((s) => kind(s) !== kind(state)), state]);
}

/** The same states, in any order. */
export function sameStates(a: readonly ElementState[] | undefined, b: readonly ElementState[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((s) => y.includes(s));
}

/**
 * CSS for the states, after the element's selector: `:hover:active`, then a
 * pseudo-element last (`:hover::before`). A color scheme isn't written here:
 * it's a condition around the rule, the project's way (dom/scheme.ts schemeParts).
 */
export function stateSelector(states: readonly ElementState[] | undefined): string {
  const list = states ?? [];
  const classes = list.filter((s) => !isColorScheme(s) && !isPseudoElement(s)).map((s) => `:${s}`);
  const element = list.filter(isPseudoElement).map((s) => `::${s}`);
  return [...classes, ...element].join("");
}
