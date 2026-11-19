import type { ElementState, ElementTarget, StyleSource, WidthRange } from "@pilot/protocol";
import { DOM_REMOVE, sortStates } from "@pilot/protocol";
import { type Forced, type Preview, stylesheetPreview } from "../dom/preview.ts";
import { type InsertRule, type StructurePreview, domStructurePreview, insertIdOf, isStructural, parseSpec } from "../dom/structure.ts";
import { type TextPreview, domTextPreview, textRunOf } from "../dom/text.ts";
import { sameStates } from "./states.ts";
import { type EditableElement, describeElement } from "../dom/target.ts";
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
  /**
   * How to find the element again (and tell the agent which it is), taken
   * when the element is first changed: what the change set and a reload's
   * restore use (see edits/persist.ts).
   */
  target: ElementTarget;
  /** The page it was changed on (`location.pathname`). */
  path: string;
  property: string;
  /** The value set; "" drops Pilot's value (the page's own shows again). */
  value: string;
  /** Set when this change removes the page's own value (see Removal); `value` is then its preview. */
  removal?: Removal;
  /** The viewport widths it's for (the search's width chip). None: every width. */
  widths?: WidthRange;
  /** The element states it's for, together (the search's state pills). None: the element as it is. */
  states?: ElementState[];
  /**
   * The job it was sent in (Send to the agent, see bridge/jobs.ts): sent
   * changes stay on the page until the agent is done and they're checked,
   * and aren't sent again. None: not sent yet.
   */
  job?: string;
  /**
   * A text change (`property` is a text run's, see textProperty): the page's own text when it
   * was made, for the change set while the element isn't on the page.
   */
  from?: string;
}

/** A change still in effect, for the change set. */
export interface RecordedChange {
  element: EditableElement;
  /** The element as described when it was first changed (see Entry). */
  target: ElementTarget;
  /** The page it was changed on (`location.pathname`). */
  path: string;
  property: string;
  /** The value set (a removal's preview when `removal` is set). */
  value: string;
  removal?: Removal;
  widths?: WidthRange;
  states?: ElementState[];
  /** The job it was sent in; none when not sent yet. */
  job?: string;
  /** A text change: the page's own text when it was made (see Entry). */
  from?: string;
}

/** One undo step: a single change, or every change made with the same gesture. */
interface Step {
  /** Continuous-interaction token: changes sharing it are one undo step. */
  gesture?: object;
  entries: Entry[];
  /** A Clear: every change before it stops being in effect (undoing it brings them back). */
  clears?: boolean;
}

/** A change as saved (no element: it's found again from `target` on load). */
export type SavedEntry = Omit<Entry, "element">;

/** A step as saved: its changes, or a Clear. */
export type SavedStep = SavedEntry[] | { clears: true };

/** The history as saved, to survive reloads (see edits/persist.ts). */
export interface SavedHistory {
  version: 1;
  done: SavedStep[];
  undone: SavedStep[];
}

/** Finds the element a saved change is for: the live one, or a detached stand-in. */
export type Resolve = (target: ElementTarget, path: string) => EditableElement;

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
  private listeners = new Set<() => void>();
  /** An element shown in its states while they're edited (see Forced). Not saved. */
  private forced: Forced | null = null;

  constructor(
    private readonly preview: Preview = stylesheetPreview,
    private readonly text: TextPreview = domTextPreview,
    private readonly structure: StructurePreview = domStructurePreview,
  ) {}

  /** Call `listener` after every change, undo, redo and restore. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The history as plain data, to save (steps keep their order; gestures are dropped). */
  serialize(): SavedHistory {
    const save = (steps: Step[]): SavedStep[] =>
      steps.map((s) => (s.clears ? { clears: true } : s.entries.map(({ element: _, ...rest }) => rest)));
    return { version: 1, done: save(this.done), undone: save(this.undone) };
  }

  /**
   * Restore a saved history, finding each change's element with `resolve`
   * (an element that isn't on the page gets a detached stand-in, so nothing
   * is lost: see reattach). Shows it on the page.
   */
  load(saved: SavedHistory, resolve: Resolve): void {
    if (saved?.version !== 1) return;
    // The new elements first (dom/structure.ts), made again from their
    // markup: the changes on them and inside them are found in them.
    for (const step of [...(saved.done ?? []), ...(saved.undone ?? [])]) {
      if (!Array.isArray(step)) continue;
      for (const e of step) {
        const id = insertIdOf(e.property);
        if (id) this.structure.node(id, parseSpec(e.value));
      }
    }
    const elements = new Map<string, EditableElement>();
    const element = (e: SavedEntry) => {
      const key = `${e.path}|${e.target.selector}`;
      let el = elements.get(key);
      if (!el) elements.set(key, (el = resolve(e.target, e.path)));
      return el;
    };
    const steps = (list: SavedStep[]): Step[] =>
      list.map((step) =>
        Array.isArray(step) ? { entries: step.map((e) => ({ ...e, element: element(e) })) } : { entries: [], clears: true },
      );
    this.done = steps(saved.done ?? []);
    this.undone = steps(saved.undone ?? []);
    this.render();
  }

  /**
   * Find again the elements of changes whose element isn't on the page (a
   * stand-in after a reload, or replaced by a re-render), with `resolve`.
   * Shows the changes on them. Call it when the page may have changed (a
   * launch, a selection, navigation).
   */
  reattach(resolve: Resolve): void {
    const found = new Map<EditableElement, EditableElement>();
    let changed = false;
    for (const step of [...this.done, ...this.undone]) {
      for (const entry of step.entries) {
        if (entry.element.isConnected) continue;
        let el = found.get(entry.element);
        if (!el) found.set(entry.element, (el = resolve(entry.target, entry.path)));
        if (el.isConnected) {
          entry.element = el;
          changed = true;
        }
      }
    }
    if (changed) this.render();
  }

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
    options: { removal?: Removal; widths?: WidthRange; states?: readonly ElementState[]; from?: string } = {},
  ): void {
    const { removal, widths } = options;
    const states = options.states?.length ? sortStates(options.states) : undefined;
    const last = this.done.at(-1);
    const step = gesture && last?.gesture === gesture ? last : undefined;
    const existing = step?.entries.find(
      (e) => e.element === element && e.property === property && sameWidths(e.widths, widths) && sameStates(e.states, states),
    );
    if (existing) {
      existing.value = value;
      existing.removal = removal;
    } else {
      const current = this.currentFor(element, property, widths, states);
      if (!removal && !current?.removal && (current?.value ?? "") === value) return;
      const entry: Entry = { element, target: this.targetOf(element), path: location.pathname, property, value, removal, widths, states };
      if (options.from !== undefined) entry.from = options.from;
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
  changes(filter: { unsent?: boolean; job?: string } = {}): RecordedChange[] {
    return this.rules()
      .filter((r) => r.value !== "")
      .filter((r) => (filter.unsent ? !r.job : true) && (filter.job === undefined || r.job === filter.job))
      .map(({ element, target, path, property, value, removal, widths, states, job, from }) => ({
        element,
        target,
        path,
        property,
        value,
        removal,
        widths,
        states,
        job,
        ...(from !== undefined && { from }),
      }));
  }

  /**
   * Send: the changes in effect that weren't sent yet now belong to job
   * `jobId`. They stay on the page (the agent is applying them) and aren't
   * sent again; new changes go in the next job. `only`: just the ones it
   * picks (the rest stay unsent). Returns how many it took.
   */
  send(jobId: string, only: (change: RecordedChange) => boolean = () => true): number {
    const unsent = this.rules().filter((r) => r.value !== "" && !r.job && only(r));
    for (const entry of unsent) entry.job = jobId;
    if (unsent.length) this.render();
    return unsent.length;
  }

  /** A job taken back (cancelled before the agent was done): its changes are unsent again. */
  unsend(jobId: string): void {
    let changed = false;
    for (const step of [...this.done, ...this.undone]) {
      for (const entry of step.entries) {
        if (entry.job !== jobId) continue;
        entry.job = undefined;
        changed = true;
      }
    }
    if (changed) this.render();
  }

  /**
   * A job's changes are in the code now: they leave the history for good (no
   * undo step: undoing them would cover the real code with a stale preview).
   * `keep`: the ones that came out different, which stay on the page, still
   * the job's.
   */
  settle(jobId: string, keep: (change: RecordedChange) => boolean = () => false): void {
    const settle = (steps: Step[]) =>
      steps
        .map((step) => ({
          ...step,
          entries: step.entries.filter((e) => e.job !== jobId || keep(e)),
        }))
        .filter((step) => step.clears || step.entries.length > 0);
    this.done = settle(this.done);
    this.undone = settle(this.undone);
    this.render();
  }

  /**
   * Runs `measure` with only `changes` on the page instead of everything in
   * effect (none: the page's own CSS alone), then shows the real preview
   * again, in the same task (nothing is painted in between). How Pilot checks
   * what the page gives against what a job asked for (edits/verify.ts).
   */
  probe<T>(changes: RecordedChange[], measure: () => T): T {
    this.preview.render(changes.filter((c) => textRunOf(c.property) === null && !isStructural(c.property)).map((c) => (c.value === "" ? { ...c, value: "revert-layer" } : c)));
    try {
      return measure();
    } finally {
      this.preview.render(this.previewRules(), this.forced);
    }
  }

  /**
   * What Pilot sets `property` to on `element` at the viewport width `width`
   * (the window's, by default), or null where it sets nothing: the latest
   * preview rule that sets it there, a longhand read out of a shorthand
   * (`grid-column-start` from `grid-column`). What a field shows over the
   * page's own CSS.
   */
  valueOf(element: EditableElement, property: string, width = window.innerWidth, states?: readonly ElementState[]): string | null {
    const rule = this.activeRule(element, property, width, states);
    return rule ? valueIn(rule, property) || null : null;
  }

  /**
   * Whether `property` is removed on `element` at the viewport width `width`
   * (the window's, by default): the change in effect there is a removal. The
   * field then shows nothing, and the change set says "remove".
   */
  removalOf(element: EditableElement, property: string, width = window.innerWidth, states?: readonly ElementState[]): Removal | null {
    const rule = this.activeRule(element, property, width, states);
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

  /**
   * Clear: no change is in effect anymore, so the page shows its own CSS again
   * (e.g. once the agent has applied the copied prompt). One undo step: undo
   * brings every change back. Does nothing when there's nothing in effect.
   */
  clear(): void {
    if (!this.rules().length) return;
    this.done.push({ entries: [], clears: true });
    this.undone = [];
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
    for (const { entries, clears } of this.done) {
      if (clears) out.length = 0;
      for (const entry of entries) {
        const covered = longhandsOf(entry.property);
        for (let i = out.length - 1; i >= 0; i--) {
          const prior = out[i] as Entry;
          const replaced =
            prior.element === entry.element &&
            sameWidths(prior.widths, entry.widths) &&
            sameStates(prior.states, entry.states) &&
            (prior.property === entry.property || covered.includes(prior.property));
          if (replaced) out.splice(i, 1);
        }
        const needed =
          entry.value !== "" ||
          out.some((r) => r.element === entry.element && sameStates(r.states, entry.states) && sets(r, entry.property));
        if (needed) out.push(entry);
      }
    }
    return out;
  }

  private render(): void {
    // The new elements first: the stylesheet and the text preview show changes inside them too.
    this.structure.render(this.insertRules());
    this.preview.render(this.previewRules(), this.forced);
    this.text.render(
      this.rules()
        .filter((r) => textRunOf(r.property) !== null && r.value !== "")
        .map((r) => ({ element: r.element, run: textRunOf(r.property) ?? 0, text: r.value })),
    );
    for (const listener of this.listeners) listener();
  }

  /**
   * The stylesheet's rules: the CSS changes (text changes are shown by the
   * text preview, new elements by the structure preview), then the deleted
   * elements hidden, last so no change of Pilot's shows them again.
   */
  private previewRules() {
    const rules = this.rules();
    const css = rules
      .filter((r) => textRunOf(r.property) === null && !isStructural(r.property))
      .map((r) => (r.value === "" ? { ...r, value: "revert-layer" } : r));
    const hidden = rules.filter((r) => r.property === DOM_REMOVE).map((r) => ({ element: r.element, property: "display", value: "none" }));
    return [...css, ...hidden];
  }

  /** The new elements in effect, in the order added (dom/structure.ts). */
  private insertRules(): InsertRule[] {
    const out: InsertRule[] = [];
    for (const r of this.rules()) {
      const id = insertIdOf(r.property);
      const spec = id ? parseSpec(r.value) : null;
      if (id && spec) out.push({ anchor: r.element, id, spec });
    }
    return out;
  }

  /** The elements deleted (in the DOM tree), still on the page but hidden by the preview. */
  removed(): Set<Element> {
    return new Set(this.rules().filter((r) => r.property === DOM_REMOVE && r.value !== "").map((r) => r.element));
  }

  /**
   * The text of `element`'s run `run` (0: the first, a text-only element's
   * whole text), as the page has it without Pilot's text change: what a text
   * change is checked against (edits/verify.ts) and its `from`.
   */
  pageText(element: EditableElement, run = 0): string {
    return this.text.pageText(element, run);
  }

  /**
   * Show `forced.element` in its states while they're edited (the search's
   * state pills), or stop (null). Not a change: nothing is recorded.
   */
  setForced(forced: Forced | null): void {
    const same =
      forced?.element === this.forced?.element &&
      sameStates(forced?.states, this.forced?.states) &&
      JSON.stringify(forced?.page) === JSON.stringify(this.forced?.page);
    if (same) return;
    this.forced = forced;
    this.preview.render(this.previewRules(), this.forced);
  }

  /** The element's description: the one taken at its first change, so all its changes agree. */
  private targetOf(element: EditableElement): ElementTarget {
    for (const step of [...this.done, ...this.undone]) {
      const entry = step.entries.find((e) => e.element === element);
      if (entry) return entry.target;
    }
    return describeElement(element);
  }

  /** The rule that wins for `property` on `element` at `width`: the latest that sets it there. */
  private activeRule(element: EditableElement, property: string, width: number, states?: readonly ElementState[]): Entry | undefined {
    const rules = this.rules();
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i] as Entry;
      if (r.element === element && sameStates(r.states, states) && sets(r, property) && inWidths(r.widths ?? null, width)) return r;
    }
    return undefined;
  }

  /**
   * What Pilot sets `property` to for exactly these widths (the latest rule
   * for them that sets it), to tell a change from a no-op.
   */
  private currentFor(
    element: EditableElement,
    property: string,
    widths?: WidthRange,
    states?: readonly ElementState[],
  ): { value: string; removal?: Removal } | undefined {
    const rules = this.rules();
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i] as Entry;
      if (r.element !== element || !sameWidths(r.widths, widths) || !sameStates(r.states, states) || !sets(r, property)) continue;
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
