import type { ElementState, WidthRange } from "@pilot/protocol";
import { mediaRange } from "../dom/breakpoints.ts";
import { type Declared, type MatchedRule, baseValue, beats, declarationsOf, rangeValue, resolve } from "../dom/declared.ts";
import type { EditableElement } from "../dom/target.ts";
import { clearProperty } from "./clear.ts";
import { type EditHistory, type RecordedChange, longhandsOf } from "./history.ts";
import { sameStates } from "./states.ts";
import { ALL_WIDTHS, type WidthChip, isBaseChip } from "./widths.ts";

/**
 * Where an edit reaches, among the viewport widths (the owner's design,
 * 2026-11-26). With no width chip, an edit changes the rule that applies at
 * the window's width: with `pt-2 md:pt-4 lg:pt-12` and the window between md
 * and lg, `md:pt-4`, so it reaches md to lg, as the project's own rules
 * already say. Resizing past lg, the next edit changes `lg:pt-12`. The chip
 * says otherwise on purpose: a range keeps the value there whatever the
 * window, Base is the value without a media query, All widths the base value
 * with the property's breakpoint rules removed.
 *
 * Rules are read from the page and Pilot's own changes, like the fields
 * (pills read like CSS). Only width conditions count: a rule in any other
 * media query (dark mode, print, hover capability) isn't placed among the
 * widths yet (open, the owner's call). A "from" rule overlapping a "to" one
 * is an edge case, a CSS mistake: whichever wins in the cascade shows.
 */

/** Where a value is declared: `"base"` (no media query) or a width range. */
export type WidthKey = "base" | WidthRange;

/** A run of viewport widths where one declaration of the property applies. */
export interface Span {
  /** Its first width. */
  min: number;
  /** Its last width; none: on and up. */
  max?: number;
  /** Where the value that applies there is declared ("base" too where nothing is). */
  key: WidthKey;
  /** That value; "" where nothing declares it. */
  value: string;
}

/** One declaration that may apply: the page's, or Pilot's change. */
interface Candidate {
  key: WidthKey;
  range: WidthRange;
  value: string;
  important: boolean;
  /** Its place in the page's cascade (the project's rule; Pilot's change beside it sits right after). */
  match?: MatchedRule;
  /** The element's style attribute. */
  inline?: boolean;
  /** Pilot's change at widths the project sets nothing for: placed by Pilot among the project's rules (dom/anchored.ts). */
  own?: boolean;
}

export function sameKey(a: WidthKey, b: WidthKey): boolean {
  if (a === "base" || b === "base") return a === b;
  return a.min === b.min && a.max === b.max;
}

/** The key as the history takes it: no widths for the base. */
export function widthsOf(key: WidthKey): WidthRange | undefined {
  return key === "base" ? undefined : key;
}

function keyOf(range: WidthRange): WidthKey {
  return range.min === undefined && range.max === undefined ? "base" : range;
}

function contains(range: WidthRange, width: number): boolean {
  return (range.min === undefined || width >= range.min) && (range.max === undefined || width <= range.max);
}

/**
 * The declarations of `property` that may apply to the element in exactly
 * `states`, at some width: the page's (each with its media query's range),
 * with Pilot's changes in their place (beside the project's rule for the same
 * widths, or on their own), and its removals taking theirs away.
 */
function candidatesOf(element: EditableElement, property: string, states: readonly ElementState[] | undefined, history: EditHistory, changes = history.changes()): Candidate[] {
  let out: Candidate[] = [];
  for (const placed of declarationsOf(element, property, states)) {
    const range = placed.media ? mediaRange(placed.media) : {};
    if (!range) continue;
    out.push({ key: keyOf(range), range, value: placed.declared.value, important: placed.declared.important, match: placed.match });
  }
  if (!states?.length) {
    const inline = resolve(property, (element as HTMLElement).style as CSSStyleDeclaration | undefined, []);
    if (inline) out.push({ key: "base", range: {}, value: inline.value, important: inline.important, inline: true });
  }
  const sets = (c: RecordedChange) => c.property === property || longhandsOf(c.property).includes(property);
  const keys: WidthKey[] = [];
  for (const c of changes) {
    if (c.element !== element || !sameStates(c.states, states) || !sets(c)) continue;
    const key = c.widths ? keyOf(c.widths) : "base";
    if (!keys.some((k) => sameKey(k, key))) keys.push(key);
  }
  for (const key of keys) {
    const at = widthsOf(key) ?? "base";
    const here = out.filter((c) => sameKey(c.key, key));
    if (history.removes(element, property, at, states)) {
      // The removed declaration (the one that won there, and the same value repeated: clearProperty's `also`) no longer applies.
      const removed = here.reduce<Candidate | null>((b, c) => (!b || wins(c, b) ? c : b), null);
      out = out.filter((c) => !here.includes(c) || c.value.trim() !== removed?.value.trim());
      continue;
    }
    const value = history.valueOf(element, property, at, states);
    if (value === null) continue;
    const best = here.filter((c) => !c.inline).reduce<Candidate | null>((b, c) => (!b || wins(c, b) ? c : b), null);
    out = out.filter((c) => !here.includes(c) || c.inline);
    out.push(
      best?.match
        ? { ...best, value, match: { ...best.match, order: best.match.order + 0.5 } }
        : { key, range: key === "base" ? {} : key, value, important: false, own: true },
    );
  }
  return out;
}

/** Whether `a` wins over `b` where both apply. */
function wins(a: Candidate, b: Candidate): boolean {
  if (a.important !== b.important) return a.important;
  if (a.inline || b.inline) return !!a.inline;
  if (a.match && b.match) return beats({ important: a.important, rule: a.match }, { important: b.important, rule: b.match });
  // Pilot's own placement (dom/anchored.ts): after the wider rules it overlaps, before the narrower ones.
  const n = narrower(a.range, b.range);
  return n !== 0 ? n > 0 : !!a.own;
}

/** > 0 when range `a` is the narrower (a breakpoint after `b` in mobile-first or desktop-first CSS). */
function narrower(a: WidthRange, b: WidthRange): number {
  const ends = (r: WidthRange) => (r.min !== undefined ? 1 : 0) + (r.max !== undefined ? 1 : 0);
  if (ends(a) !== ends(b)) return ends(a) - ends(b);
  if (a.min !== undefined && b.min !== undefined && a.max === undefined && b.max === undefined) return a.min - b.min;
  if (a.max !== undefined && b.max !== undefined && a.min === undefined && b.min === undefined) return b.max - a.max;
  if (a.min !== undefined && a.max !== undefined && b.min !== undefined && b.max !== undefined) return b.max - b.min - (a.max - a.min);
  return 0;
}

function winnerAt(candidates: Candidate[], width: number): Candidate | null {
  let best: Candidate | null = null;
  for (const c of candidates) if (contains(c.range, width) && (!best || wins(c, best))) best = c;
  return best;
}

/**
 * Where each of the property's values applies, from 0 up: runs of widths,
 * each with the declaration that wins there, adjacent runs of the same one
 * merged. Not how the media queries are written (`md:` has no end), but
 * where each value applies: `pt-2 md:pt-4 lg:pt-12` is 0–767, 768–1023,
 * 1024 and up. `extra`: a place for a value that isn't declared yet (the
 * width chip's range), to show where it would apply.
 */
export function spansOf(
  element: EditableElement,
  property: string,
  states: readonly ElementState[] | undefined,
  history: EditHistory,
  extra?: WidthKey,
): Span[] {
  const candidates = candidatesOf(element, property, states, history);
  if (extra && extra !== "base" && !candidates.some((c) => sameKey(c.key, extra))) {
    candidates.push({ key: extra, range: extra, value: "", important: false, own: true });
  }
  const edges = new Set<number>([0]);
  for (const c of candidates) {
    if (c.range.min !== undefined) edges.add(c.range.min);
    if (c.range.max !== undefined) edges.add(c.range.max + 1);
  }
  const sorted = [...edges].sort((a, b) => a - b);
  const spans: Span[] = [];
  sorted.forEach((min, i) => {
    const next = sorted[i + 1];
    const winner = winnerAt(candidates, min);
    const key = winner?.key ?? "base";
    const value = winner?.value ?? "";
    const last = spans.at(-1);
    if (last && sameKey(last.key, key) && last.value === value) {
      if (next === undefined) delete last.max;
      else last.max = next - 1;
      return;
    }
    spans.push({ min, ...(next !== undefined && { max: next - 1 }), key, value });
  });
  return spans;
}

/** The property has rules for some widths: the bars under the ruler are worth showing. */
export function hasWidthRules(spans: readonly Span[]): boolean {
  return spans.some((s) => s.key !== "base");
}

/**
 * Where an edit of `property` goes with no width chip: the rule that applies
 * at `width` (its widths, or the base), "base" when nothing does.
 */
export function targetAt(
  element: EditableElement,
  property: string,
  states: readonly ElementState[] | undefined,
  width: number,
  history: EditHistory,
): WidthKey {
  return winnerAt(candidatesOf(element, property, states, history), width)?.key ?? "base";
}

/** Where the chip sends an edit of `property` (no chip: the rule that applies at `width`; All widths: the base). */
export function keyFor(
  element: EditableElement,
  property: string,
  chip: WidthChip | null | undefined,
  states: readonly ElementState[] | undefined,
  width: number,
  history: EditHistory,
): WidthKey {
  if (chip === ALL_WIDTHS || isBaseChip(chip)) return "base";
  if (chip) return chip;
  return targetAt(element, property, states, width, history);
}

/** The page's own value at a place: its rule for exactly those widths, or its base value. */
export function pageValueAt(element: Element, property: string, key: WidthKey, states?: readonly ElementState[]): Declared | null {
  return key === "base" ? baseValue(element, property, states) : rangeValue(element, property, key, states);
}

/**
 * Apply a field's change where the chip sends it (keyFor), on one element. A
 * shorthand whose sides go to different rules (`pt` at md, the rest base) is
 * written per side, each where its own rule is. All widths also removes the
 * property's breakpoint rules (the project's, as removals, and Pilot's own),
 * so the one value applies everywhere. `""` clears (clearProperty).
 */
export function applyChange(
  history: EditHistory,
  element: EditableElement,
  property: string,
  value: string,
  gesture: object | undefined,
  options: { chip?: WidthChip | null; states?: readonly ElementState[]; width: number; again?: boolean },
): void {
  const { chip, states, width, again } = options;
  // One undo step, even when it writes several (All widths, a shorthand's sides).
  gesture ??= {};
  const set = (p: string, v: string, key: WidthKey) => {
    const widths = widthsOf(key);
    if (v === "") clearProperty(history, element, p, gesture, widths, states);
    else history.apply(element, p, v, gesture, { widths, states: states ? [...states] : undefined, again });
  };
  const longhands = longhandsOf(property);
  if (chip === ALL_WIDTHS) {
    set(property, value, "base");
    const changes = history.changes();
    for (const key of widthKeys(element, longhands, states, history, changes)) {
      const widths = widthsOf(key);
      if (longhands.length === 1) {
        clearProperty(history, element, property, gesture, widths, states);
        continue;
      }
      // The shorthand (Pilot's values there, its sides' too, and the project's `padding` rule), then
      // the sides the project declares on their own there (`md:pt-4`), once each.
      const shorthand = pageValueAt(element, property, key, states)?.rule;
      clearProperty(history, element, property, gesture, widths, states);
      for (const p of longhands) {
        const side = pageValueAt(element, p, key, states);
        if (side && (!side.rule || side.rule !== shorthand)) clearProperty(history, element, p, gesture, widths, states);
      }
    }
    return;
  }
  if (longhands.length > 1) {
    const keys = longhands.map((p) => keyFor(element, p, chip, states, width, history));
    const first = keys[0] as WidthKey;
    if (!keys.every((k) => sameKey(k, first))) {
      longhands.forEach((p, i) => set(p, value === "" ? "" : longhandValue(property, value, p), keys[i] as WidthKey));
      return;
    }
    return set(property, value, first);
  }
  set(property, value, keyFor(element, property, chip, states, width, history));
}

/** The widths the properties are declared for (the page's breakpoint rules, Pilot's changes), base left out. */
function widthKeys(
  element: EditableElement,
  properties: readonly string[],
  states: readonly ElementState[] | undefined,
  history: EditHistory,
  changes: RecordedChange[],
): WidthRange[] {
  const keys: WidthRange[] = [];
  for (const p of properties) {
    for (const c of candidatesOf(element, p, states, history, changes)) {
      if (c.key !== "base" && !keys.some((k) => sameKey(k, c.key))) keys.push(c.key);
    }
    // Removed already: the removal stays, Pilot's value goes with the next clear.
  }
  return keys;
}

/** One longhand's value out of a shorthand's (`8px 12px` → padding-right `12px`); the whole value when it can't tell (a var()). */
function longhandValue(shorthand: string, value: string, longhand: string): string {
  const style = document.createElement("div").style;
  style.setProperty(shorthand, value);
  return style.getPropertyValue(longhand) || value;
}
