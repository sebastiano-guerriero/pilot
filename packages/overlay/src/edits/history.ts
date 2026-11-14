import type { StyleSource, WidthRange } from "@pilot/protocol";
import { type Preview, stylesheetPreview } from "../dom/preview.ts";
import type { EditableElement } from "../dom/target.ts";
import { inWidths } from "./widths.ts";

/**
 * A value the designer removed (cleared a field the page's own CSS sets): the
 * element shouldn't declare the property. What the change set tells the agent.
 */
export interface Removal {
  /** The page's own value that was removed, as declared. */
  from: string;
  /** Where the page declares it. */
  source: StyleSource;
}

interface Entry {
  element: EditableElement;
  property: string;
  /** The value set; "" drops Pilot's value (the page's own shows again). */
  value: string;
  /** Set when this change removes the page's own value (see Removal); `value` is then its preview. */
  removal?: Removal;
  /** The viewport widths it's for (the search's width chip). None: every width. */
  widths?: WidthRange;
}

/** A change still in effect, for the change set. */
export interface RecordedChange {
  element: EditableElement;
  property: string;
  /** The value set (a removal's preview when `removal` is set). */
  value: string;
  removal?: Removal;
  widths?: WidthRange;
}

/** One undo step: a single change, or every change made with the same gesture. */
interface Step {
  /** Continuous-interaction token: changes sharing it are one undo step. */
  gesture?: object;
  entries: Entry[];
}

/**
 * Every property change Pilot makes goes through here: it records the change
 * and shows it on the page through the preview (a stylesheet, see
 * dom/preview.ts; never the element's own `style`), so it can be undone
 * (Cmd/Ctrl+Z) and redone (Cmd/Ctrl+Shift+Z, Ctrl+Y). The change set is
 * built from it (`changes()`), and fields read Pilot's values from it
 * (`valueOf()`, `removalOf()`).
 *
 * The preview is rebuilt from the changes in effect after every change, undo
 * and redo, so there's nothing to restore: undoing a change just leaves it out.
 */
export class EditHistory {
  private done: Step[] = [];
  private undone: Step[] = [];

  constructor(private readonly preview: Preview = stylesheetPreview) {}

  /**
   * Set `property` to `value` on `element`. Pass the same `gesture` object
   * for every change that belongs together, and they're undone as a single
   * step: all the moves of a drag, or both sides of a linked `px` edit.
   * Setting what Pilot already sets there is a no-op, and so is "" where
   * Pilot sets nothing.
   *
   * `options.removal` marks the change as removing the page's own value (see
   * clearProperty): `value` is then only the preview of what applies without
   * it. `options.widths`: the viewport widths the change is for (none: every
   * width). Changes for different widths are separate changes, even within a
   * gesture.
   */
  apply(
    element: EditableElement,
    property: string,
    value: string,
    gesture?: object,
    options: { removal?: Removal; widths?: WidthRange } = {},
  ): void {
    const { removal, widths } = options;
    const last = this.done.at(-1);
    const step = gesture && last?.gesture === gesture ? last : undefined;
    const existing = step?.entries.find(
      (e) => e.element === element && e.property === property && sameWidths(e.widths, widths),
    );
    if (existing) {
      existing.value = value;
      existing.removal = removal;
    } else {
      const current = this.currentFor(element, property, widths);
      if (!removal && !current?.removal && (current?.value ?? "") === value) return;
      const entry: Entry = { element, property, value, removal, widths };
      if (step) step.entries.push(entry);
      else this.done.push({ gesture, entries: [entry] });
    }
    this.undone = [];
    this.render();
  }

  /**
   * The changes in effect (not undone), one per element, property and width
   * range, with its latest value, in the order of their latest change. A
   * change a later one replaced (see rules) isn't listed, and neither are
   * changes back to "" (Pilot's value dropped). What the change set is built from.
   */
  changes(): RecordedChange[] {
    return this.rules()
      .filter((r) => r.value !== "")
      .map(({ element, property, value, removal, widths }) => ({ element, property, value, removal, widths }));
  }

  /**
   * What Pilot sets `property` to on `element` at the viewport width `width`
   * (the window's, by default), or null where it sets nothing: the latest
   * preview rule that sets it there, a longhand read out of a shorthand
   * (`grid-column-start` from `grid-column`). What a field shows over the
   * page's own CSS.
   */
  valueOf(element: EditableElement, property: string, width = window.innerWidth): string | null {
    const rule = this.activeRule(element, property, width);
    return rule ? valueIn(rule, property) || null : null;
  }

  /**
   * Whether `property` is removed on `element` at the viewport width `width`
   * (the window's, by default): the change in effect there is a removal. The
   * field then shows nothing, and the change set says "remove".
   */
  removalOf(element: EditableElement, property: string, width = window.innerWidth): Removal | null {
    const rule = this.activeRule(element, property, width);
    return rule?.property === property ? (rule.removal ?? null) : null;
  }

  /**
   * Take back what `gesture` did to `property` so far, as if it never touched
   * it, and drop it from the step. E.g. releasing Alt mid-drag un-mirrors the
   * opposite side.
   */
  revert(element: EditableElement, property: string, gesture: object): void {
    const step = this.done.at(-1);
    if (!step || step.gesture !== gesture) return;
    const index = step.entries.findIndex((e) => e.element === element && e.property === property);
    if (index === -1) return;
    step.entries.splice(index, 1);
    if (step.entries.length === 0) this.done.pop();
    this.render();
  }

  /** Revert the latest step. Returns false when there's nothing to undo. */
  undo(): boolean {
    const step = this.done.pop();
    if (!step) return false;
    this.undone.push(step);
    this.render();
    return true;
  }

  /** Re-apply the latest undone step. Returns false when there's nothing to redo. */
  redo(): boolean {
    const step = this.undone.pop();
    if (!step) return false;
    this.done.push(step);
    this.render();
    return true;
  }

  /**
   * The preview's rules: every change in effect, in the order made. A change
   * replaces the earlier ones it covers for the same element and widths: the
   * same property, or a longhand of it (`padding` replaces `padding-top`).
   * A change to "" drops Pilot's value: it's left out, unless an earlier
   * rule of Pilot's still sets the property (a shorthand, or the same
   * property for other widths). Then it stays, and the preview writes
   * `revert-layer` for it: the page's own value, as if Pilot didn't set it.
   */
  private rules(): Entry[] {
    const out: Entry[] = [];
    for (const { entries } of this.done) {
      for (const entry of entries) {
        const covered = longhandsOf(entry.property);
        for (let i = out.length - 1; i >= 0; i--) {
          const prior = out[i] as Entry;
          const replaced =
            prior.element === entry.element &&
            sameWidths(prior.widths, entry.widths) &&
            (prior.property === entry.property || covered.includes(prior.property));
          if (replaced) out.splice(i, 1);
        }
        const needed = entry.value !== "" || out.some((r) => r.element === entry.element && sets(r, entry.property));
        if (needed) out.push(entry);
      }
    }
    return out;
  }

  private render(): void {
    this.preview.render(this.rules().map((r) => (r.value === "" ? { ...r, value: "revert-layer" } : r)));
  }

  /** The rule that wins for `property` on `element` at `width`: the latest that sets it there. */
  private activeRule(element: EditableElement, property: string, width: number): Entry | undefined {
    const rules = this.rules();
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i] as Entry;
      if (r.element === element && sets(r, property) && inWidths(r.widths ?? null, width)) return r;
    }
    return undefined;
  }

  /**
   * What Pilot sets `property` to for exactly these widths (the latest rule
   * for them that sets it), to tell a change from a no-op.
   */
  private currentFor(element: EditableElement, property: string, widths?: WidthRange): { value: string; removal?: Removal } | undefined {
    const rules = this.rules();
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i] as Entry;
      if (r.element !== element || !sameWidths(r.widths, widths) || !sets(r, property)) continue;
      return { value: valueIn(r, property), removal: r.property === property ? r.removal : undefined };
    }
    return undefined;
  }
}

/** Whether a change sets `property`: it's that property, or a shorthand of it. */
function sets(entry: Entry, property: string): boolean {
  return entry.property === property || longhandsOf(entry.property).includes(property);
}

/** `property`'s value in a change: the value itself, or a longhand read out of a shorthand. "" for none. */
function valueIn(entry: Entry, property: string): string {
  if (entry.property === property || entry.value === "") return entry.value;
  const style = document.createElement("div").style;
  style.setProperty(entry.property, entry.value);
  return style.getPropertyValue(property);
}

/**
 * The longhands a property sets: `grid-column` → grid-column-start and
 * grid-column-end. Just the property itself when it isn't a shorthand.
 * A change to a shorthand replaces Pilot's earlier changes to its longhands.
 */
const longhandCache = new Map<string, string[]>();
export function longhandsOf(property: string): string[] {
  let longhands = longhandCache.get(property);
  if (!longhands) {
    const style = document.createElement("div").style;
    style.setProperty(property, "initial");
    longhands = Array.from({ length: style.length }, (_, i) => style.item(i));
    if (longhands.length <= 1) longhands = [property];
    longhandCache.set(property, longhands);
  }
  return longhands;
}

function sameWidths(a?: WidthRange, b?: WidthRange): boolean {
  return a?.min === b?.min && a?.max === b?.max;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Cmd+Z / Ctrl+Z → "undo"; Cmd+Shift+Z / Ctrl+Shift+Z / Ctrl+Y → "redo". */
export function historyShortcut(e: KeyboardEvent, mac = isMac): "undo" | "redo" | null {
  if (e.altKey || !(mac ? e.metaKey : e.ctrlKey)) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && !mac) return "redo";
  return null;
}
