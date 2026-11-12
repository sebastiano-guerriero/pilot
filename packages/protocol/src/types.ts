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
  /** Computed value before the edit. */
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
}

/** Where a value is declared in the page's CSS. */
export type StyleSource =
  /** The element's own style attribute, in the app's markup. */
  | { kind: "inline" }
  /**
   * A stylesheet rule. `elements`: how many elements on the page that
   * selector matches, so the agent can tell a one-off from a shared rule.
   */
  | { kind: "rule"; selector: string; elements?: number };

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
