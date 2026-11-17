/**
 * The change-set model: what Pilot records while a designer edits, and what
 * gets handed to the agent (via clipboard or the local bridge).
 *
 * Pilot never edits source files. It captures *intent* as plain CSS
 * (property, before, after) on identifiable elements; the agent translates
 * that into the project's own conventions (Tailwind classes, CSS modules,
 * design tokens, styled-components...).
 */

/** How to find the edited element again. Several hints, from most to least precise. */
export interface ElementTarget {
  /** A CSS selector that matched exactly this element at capture time. */
  selector: string;
  /** Human-readable DOM path, e.g. `main > section.hero > h1`. */
  path: string;
  tag: string;
  id?: string;
  classes: string[];
  /** Trimmed snippet of the element's text, to help the agent grep for it. */
  text?: string;
  /** Optional framework hints (e.g. React component name / file) when available. */
  source?: {
    component?: string;
    file?: string;
    line?: number;
  };
}

export interface StyleChange {
  /** CSS property in kebab-case, e.g. `border-radius`. */
  property: string;
  /**
   * The page's own value before the edit, as declared in its CSS (`16px`,
   * `var(--space-4)`), or "" when the page doesn't set the property.
   */
  from: string;
  /** Value the designer set ("" when `removed`). */
  to: string;
  /**
   * The designer removed the property for this element: it shouldn't declare
   * it at all, so it gets whatever the cascade gives without that
   * declaration (another rule, the inherited value, or the default). Not the
   * same as setting it to `0` or `none`. `from` is the removed value.
   */
  removed?: boolean;
  /** Where `from` is declared in the page's CSS, when known. */
  source?: StyleSource;
  /**
   * The viewport widths the change is for, as the designer set them (the
   * width chip in Pilot's search). Absent: every width.
   */
  widths?: WidthRange;
  /**
   * The element states the change is for, together (`["hover", "active"]`:
   * hovered and pressed), in STATES order. Absent: the element as it is.
   */
  states?: ElementState[];
}

/** The element states a change can be for: CSS's pseudo-classes, Tailwind's variants. */
export type ElementState = "hover" | "focus" | "focus-visible" | "active";

/** Every state, in the order they're written (Tailwind's variant order: `hover:focus:active:`). */
export const STATES: readonly ElementState[] = ["hover", "focus", "focus-visible", "active"];

/** States in STATES order, each once. */
export function sortStates(states: Iterable<ElementState>): ElementState[] {
  const set = new Set(states);
  return STATES.filter((s) => set.has(s));
}

/**
 * Viewport widths in CSS px, both ends included: `{ min: 768 }` is 768px and
 * up, `{ max: 767 }` is to 767px (and below), `{ min: 768, max: 1199 }` is 768–1199px.
 * At least one end is set.
 */
export interface WidthRange {
  min?: number;
  max?: number;
}

/** Where a value is declared in the page's CSS. */
export type StyleSource =
  /** The element's own style attribute, in the app's markup. */
  | { kind: "inline" }
  /**
   * A stylesheet rule. `elements`: how many elements on the page that
   * selector matches, so the agent can tell a one-off from a shared rule.
   */
  | {
      kind: "rule";
      selector: string;
      elements?: number;
      /** The `@media` conditions the rule sits in, e.g. `(min-width: 768px)`, when any. */
      media?: string;
    };

export interface ElementEdit {
  target: ElementTarget;
  changes: StyleChange[];
}

export interface ChangeSet {
  id: string;
  /** ISO timestamp. */
  createdAt: string;
  page: {
    url: string;
    title: string;
    viewport: { width: number; height: number };
  };
  edits: ElementEdit[];
  /** Free-form note from the designer ("make this feel lighter", etc.). */
  note?: string;
}
