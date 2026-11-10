import type { EditableElement } from "../dom/target.ts";

interface Entry {
  element: EditableElement;
  property: string;
  /** Inline value before the change ("" = no inline value, i.e. the stylesheet's). */
  before: string;
  beforePriority: string;
  after: string;
}

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
   */
  apply(element: EditableElement, property: string, value: string, gesture?: object): void {
    const last = this.done.at(-1);
    const step = gesture && last?.gesture === gesture ? last : undefined;
    const existing = step?.entries.find((e) => e.element === element && e.property === property);
    if (existing) {
      element.style.setProperty(property, value);
      existing.after = value;
      this.undone = [];
      return;
    }
    const current = element.style.getPropertyValue(property);
    if (current === value) return;
    const entry: Entry = {
      element,
      property,
      before: current,
      beforePriority: element.style.getPropertyPriority(property),
      after: value,
    };
    if (step) step.entries.push(entry);
    else this.done.push({ gesture, entries: [entry] });
    element.style.setProperty(property, value);
    this.undone = [];
  }

  /** Revert the latest step. Returns false when there's nothing to undo. */
  undo(): boolean {
    const step = this.done.pop();
    if (!step) return false;
    for (const { element, property, before, beforePriority } of [...step.entries].reverse()) {
      if (before) element.style.setProperty(property, before, beforePriority);
      else element.style.removeProperty(property);
    }
    this.undone.push(step);
    return true;
  }

  /** Re-apply the latest undone step. Returns false when there's nothing to redo. */
  redo(): boolean {
    const step = this.undone.pop();
    if (!step) return false;
    for (const { element, property, after } of step.entries) element.style.setProperty(property, after);
    this.done.push(step);
    return true;
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
