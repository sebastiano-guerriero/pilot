import type { StyleSource } from "@pilot/protocol";
import type { EditableElement } from "../dom/target.ts";

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
  /**
   * The inline values before the change, of every longhand `property` sets
   * (just `property` itself when it isn't a shorthand). "" = no inline value,
   * i.e. the stylesheet's.
   */
  before: Snapshot;
  after: string;
  /** "important" when the value is set with !important (a removal's preview over an !important rule). */
  afterPriority: string;
  /** Set when this change removes the page's own value (see Removal). */
  removal?: Removal;
}

/** Inline values of some properties, to put back exactly. */
type Snapshot = Array<{ property: string; value: string; priority: string }>;

/** One undo step: a single change, or every change made with the same gesture. */
interface Step {
  /** Continuous-interaction token: changes sharing it are one undo step. */
  gesture?: object;
  entries: Entry[];
}

/**
 * Every property change Pilot makes goes through here: it applies the value as
 * an inline style and records it, so it can be undone (Cmd/Ctrl+Z) and redone
 * (Cmd/Ctrl+Shift+Z, Ctrl+Y). This is also where the change set's
 * `from → to` will come from.
 */
export class EditHistory {
  private done: Step[] = [];
  private undone: Step[] = [];

  /**
   * Apply `value` to `property` on `element`. Pass the same `gesture` object
   * for every change that belongs together, and they're undone as a single
   * step: all the moves of a drag, or both sides of a linked `px` edit.
   * Re-applying the current value is a no-op.
   *
   * `options.removal` marks the change as removing the page's own value (see
   * clearProperty): `value` is then only the preview of what applies without
   * it. `options.important` sets it with !important.
   */
  apply(
    element: EditableElement,
    property: string,
    value: string,
    gesture?: object,
    options: { important?: boolean; removal?: Removal } = {},
  ): void {
    const priority = options.important ? "important" : "";
    const last = this.done.at(-1);
    const step = gesture && last?.gesture === gesture ? last : undefined;
    const existing = step?.entries.find((e) => e.element === element && e.property === property);
    if (existing) {
      element.style.setProperty(property, value, priority);
      existing.after = value;
      existing.afterPriority = priority;
      existing.removal = options.removal;
      this.undone = [];
      return;
    }
    const current = element.style.getPropertyValue(property);
    const unchanged = current === value && element.style.getPropertyPriority(property) === priority;
    if (unchanged && !options.removal && !this.removalOf(element, property)) return;
    const entry: Entry = {
      element,
      property,
      before: snapshot(element, property),
      after: value,
      afterPriority: priority,
      removal: options.removal,
    };
    if (step) step.entries.push(entry);
    else this.done.push({ gesture, entries: [entry] });
    element.style.setProperty(property, value, priority);
    this.undone = [];
  }

  /**
   * The element's own inline value for `property` before Pilot changed it
   * (the app's style attribute), or null when it had none.
   */
  originalInline(element: EditableElement, property: string): { value: string; important: boolean } | null {
    const longhands = longhandsOf(property);
    for (const step of this.done) {
      for (const entry of step.entries) {
        if (entry.element !== element) continue;
        // The first change that recorded all of it (a shorthand's longhands).
        if (!longhands.every((l) => entry.before.some((b) => b.property === l))) continue;
        const { value, priority } = read(entry.before, property);
        return value ? { value, important: priority === "important" } : null;
      }
    }
    const value = element.style.getPropertyValue(property);
    return value ? { value, important: element.style.getPropertyPriority(property) === "important" } : null;
  }

  /**
   * Whether `property` is currently removed on `element` (its latest change
   * is a removal): the field shows nothing, the change set says "remove".
   */
  removalOf(element: EditableElement, property: string): Removal | null {
    for (let i = this.done.length - 1; i >= 0; i--) {
      const entries = (this.done[i] as Step).entries;
      for (let j = entries.length - 1; j >= 0; j--) {
        const entry = entries[j] as Entry;
        const touches = entry.property === property || longhandsOf(entry.property).includes(property);
        if (entry.element !== element || !touches) continue;
        return entry.property === property ? (entry.removal ?? null) : null;
      }
    }
    return null;
  }

  /**
   * Take back what `gesture` did to `property` so far, as if it never touched
   * it: restores the exact earlier inline value (or the stylesheet's) and drops
   * it from the step. E.g. releasing Alt mid-drag un-mirrors the opposite side.
   */
  revert(element: EditableElement, property: string, gesture: object): void {
    const step = this.done.at(-1);
    if (!step || step.gesture !== gesture) return;
    const index = step.entries.findIndex((e) => e.element === element && e.property === property);
    if (index === -1) return;
    const [entry] = step.entries.splice(index, 1);
    if (entry) restore(element, entry.before);
    if (step.entries.length === 0) this.done.pop();
  }

  /** Revert the latest step. Returns false when there's nothing to undo. */
  undo(): boolean {
    const step = this.done.pop();
    if (!step) return false;
    for (const { element, before } of [...step.entries].reverse()) restore(element, before);
    this.undone.push(step);
    return true;
  }

  /** Re-apply the latest undone step. Returns false when there's nothing to redo. */
  redo(): boolean {
    const step = this.undone.pop();
    if (!step) return false;
    for (const { element, property, after, afterPriority } of step.entries) {
      element.style.setProperty(property, after, afterPriority);
    }
    this.done.push(step);
    return true;
  }
}

/**
 * The longhands a property sets: `grid-column` → grid-column-start and
 * grid-column-end. Just the property itself when it isn't a shorthand.
 * Undo has to put each of them back: restoring the shorthand alone can't
 * bring back a longhand that was set on its own (the shorthand reads as ""
 * until all of its longhands are set).
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

function snapshot(element: EditableElement, property: string): Snapshot {
  return longhandsOf(property).map((p) => ({
    property: p,
    value: element.style.getPropertyValue(p),
    priority: element.style.getPropertyPriority(p),
  }));
}

/** `property`'s value in a snapshot, a shorthand rebuilt from its longhands. */
function read(snapshot: Snapshot, property: string): { value: string; priority: string } {
  const style = document.createElement("div").style;
  for (const b of snapshot) if (b.value) style.setProperty(b.property, b.value, b.priority);
  return { value: style.getPropertyValue(property), priority: style.getPropertyPriority(property) };
}

function restore(element: EditableElement, snapshot: Snapshot): void {
  for (const { property, value, priority } of snapshot) {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  }
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
