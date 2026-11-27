import { sameStates } from "./states.ts";
import { holdsNow, sameCondition } from "./condition.ts";
import type { ChangeResult } from "@pilot/protocol";
import { mediaRange } from "../dom/breakpoints.ts";
import { baseValue, declaredValue, mediaOf } from "../dom/declared.ts";
import { isPageMutation } from "../dom/preview.ts";
import { normalizeText, textRunOf } from "../dom/text.ts";
import type { EditHistory, RecordedChange } from "./history.ts";
import { inWidths } from "./widths.ts";

/**
 * Did a job land? Once the agent says it's done, Pilot checks each of the
 * job's changes against the page's own CSS, by what the element ends up
 * with, not by how it's written: the agent may write `1.5rem` or `pt-6` for
 * the designer's `24px`. For each change, the element's computed value with
 * only the page's CSS is compared with its computed value with the job's
 * changes previewed (what the designer saw). Both are measured in the same
 * task, so nothing flickers (EditHistory.probe).
 *
 * Values are compared as they look: a shadow's layers that draw nothing
 * (fully transparent, or no offset, blur or spread) don't count. Tailwind
 * composes `box-shadow` from five layers, the unused ones `0 0 #0000`, so its
 * `shadow-md` computes to four empty layers and then the designer's two: by
 * text, a shadow the agent got right never matched, and each such change
 * cost a full SETTLE_TIME and a pointless follow-up (`sameLook()`).
 *
 * A text change is checked by the element's text: the page's own (Pilot's
 * text preview left out) against the designer's, whitespace runs as one space.
 *
 * A change for other viewport widths than the window's, for an element
 * state (Pilot can't put the element in a real hover or focus to measure
 * it), or on an element that isn't on this page, can't be checked now:
 * `unchecked`.
 */
export interface JobCheck {
  results: ChangeResult[];
  landed: RecordedChange[];
  differs: RecordedChange[];
  unchecked: RecordedChange[];
}

export function checkJob(history: EditHistory, jobId: string, width = window.innerWidth): JobCheck {
  const changes = history.changes({ job: jobId });
  // Changes the project's own rules hide at this width, by design (read on the page alone, Pilot's changes left out).
  const hidden = new Set(history.probe([], () => changes.filter((c) => !c.states?.length && c.element.isConnected && hiddenHere(c))));
  // A change under a condition is checked only while it holds on the page as it is (not forced).
  const conditionHere = (c: RecordedChange) => !c.condition || (holdsNow(c.condition, c.element) && !history.forced(c.condition));
  const checkable = changes.filter(
    (c) => c.element.isConnected && !c.states?.length && conditionHere(c) && inWidths(c.widths ?? null, width) && !hidden.has(c),
  );
  const isText = (c: RecordedChange) => textRunOf(c.property) !== null;
  const css = checkable.filter((c) => !isText(c));
  const read = () => css.map((c) => computed(c.element, c.property));
  const actualCss = history.probe([], read);
  const expectedCss = history.probe(changes, read);
  // A text change: the page's own text (Pilot's left out) against the designer's.
  const actual = checkable.map((c) =>
    isText(c) ? normalizeText(history.pageText(c.element, textRunOf(c.property) ?? 0)) : actualCss[css.indexOf(c)],
  );
  const expected = checkable.map((c) => (isText(c) ? normalizeText(c.value) : expectedCss[css.indexOf(c)]));
  const check: JobCheck = { results: [], landed: [], differs: [], unchecked: [] };
  for (const c of changes) {
    const i = checkable.indexOf(c);
    const expectedValue = c.removal ? "removed" : isText(c) ? normalizeText(c.value) : c.value;
    const base = { selector: c.target.selector, property: c.property, expected: expectedValue };
    if (i < 0) {
      check.unchecked.push(c);
      check.results.push({ ...base, outcome: "unchecked" });
    } else if (isText(c) ? actual[i] === expected[i] : sameLook(c.property, actual[i] as string, expected[i] as string)) {
      check.landed.push(c);
      check.results.push({ ...base, outcome: "landed" });
    } else {
      check.differs.push(c);
      check.results.push({ ...base, outcome: "differs", actual: actual[i] });
    }
  }
  return check;
}

/**
 * Whether the element's base value for `property` is what applies at this
 * width: no media query or condition of the project's wins here. A base
 * change (no widths) is checked only then. Where one wins, the change can't
 * show here, by design (the project's breakpoints are kept), and the page
 * would read the same with or without it: it's left unchecked, settled on
 * the agent's word, like a change for widths the window isn't at.
 */
function hiddenHere(c: RecordedChange): boolean {
  return c.widths ? laterBreakpointWins(c.element, c.property, c.widths) : !baseAppliesHere(c.element, c.property);
}

/**
 * Whether a project's rule for a later breakpoint wins at this width over a
 * change for `widths`: placed among the project's breakpoints (dom/anchored.ts),
 * a "from 768px" change gives way to its "from 1200px" one above 1200px, as
 * the code will, so it can't be seen there.
 */
function laterBreakpointWins(element: Element, property: string, widths: { min?: number; max?: number }): boolean {
  const now = declaredValue(element, property);
  const media = now?.rule && now.source !== "inline" ? mediaOf(now.rule) : undefined;
  const range = media ? mediaRange(media) : null;
  if (!range) return false;
  if (widths.min !== undefined && widths.max === undefined) return range.max === undefined && range.min !== undefined && range.min > widths.min;
  if (widths.max !== undefined && widths.min === undefined) return range.min === undefined && range.max !== undefined && range.max < widths.max;
  return false;
}

function baseAppliesHere(element: Element, property: string): boolean {
  const now = declaredValue(element, property);
  if (!now) return true;
  const base = baseValue(element, property);
  if (!base) return false;
  return now.source === "inline" ? base.source === "inline" : now.rule === base.rule;
}

/**
 * Two computed values that look the same: equal; the same shadows once the
 * layers that draw nothing are left out; or, anything but shadows, the same
 * but for lengths a pixel or two off (APPROX). The prompt has the agent take
 * the project's scale when it's within a pixel or two of the designer's
 * value (`pr-17`, 68px, for 67px) and say so: by exact value that was a
 * difference, a full SETTLE_TIME, and a follow-up the agent answered by
 * keeping it, the element's loader spinning all along after its reply.
 */
export function sameLook(property: string, a: string, b: string): boolean {
  if (a === b) return true;
  if (property === "box-shadow" || property === "text-shadow") return visibleShadows(a) === visibleShadows(b);
  return closeLengths(a, b);
}

/** How far a length may be from the designer's and still count as it: a pixel or two, and at most a quarter of it (1px isn't 2px). */
const APPROX = { px: 2, share: 0.25 };
const LENGTH = /-?(?:\d+\.?\d*|\.\d+)px/g;

/** The same text but for its px lengths, each close to the other's (APPROX). */
function closeLengths(actual: string, expected: string): boolean {
  if (actual.replace(LENGTH, "#") !== expected.replace(LENGTH, "#")) return false;
  const a = actual.match(LENGTH) ?? [];
  const e = expected.match(LENGTH) ?? [];
  return (
    a.length > 0 &&
    a.every((v, i) => {
      const diff = Math.abs(Number.parseFloat(v) - Number.parseFloat(e[i] as string));
      return diff <= APPROX.px && diff <= Math.abs(Number.parseFloat(e[i] as string)) * APPROX.share;
    })
  );
}

/** A computed shadow list without its layers that draw nothing; `none` when none's left. */
function visibleShadows(value: string): string {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if ((ch === "," && depth === 0) || i === value.length) {
      layers.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  const visible = layers.filter((layer) => {
    if (!layer || layer === "none") return false;
    // Fully transparent: `rgba(0, 0, 0, 0)`, `transparent`, `#0000`.
    // (Only an alpha of 0: `rgb(0, 0, 0)` is opaque black, its last 0 the blue.)
    if (/rgba\((?:[^,)]*,){3}\s*0\s*\)|rgba?\([^)]*\/\s*0%?\s*\)|\btransparent\b|#0000(?:00)?\b/i.test(layer)) return false;
    // No offset, blur or spread (`0px 0px 0px 0px`): nothing drawn, whatever its color.
    const lengths = layer.replace(/\b(inset|rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]+|[a-z]+\([^)]*\))/gi, "").match(/-?[\d.]+px/g) ?? [];
    return lengths.some((l) => Number.parseFloat(l) !== 0);
  });
  return visible.length ? visible.join(", ") : "none";
}

function computed(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim();
}

/** How long after the agent's "done" Pilot keeps checking at most, while hot reload brings the new CSS in. */
export const SETTLE_TIME = 15_000;

/**
 * What still differs is final sooner, once nothing changes: QUIET after the
 * page's stylesheets last changed (hot reload came, and what it brought is
 * in), or UNSEEN after the start when none did (it usually came before the
 * agent's "done", while the run was ending). Waiting SETTLE_TIME every
 * time, the element's loader spun 15 seconds after the agent's reply, twice
 * with the follow-up.
 */
export const QUIET = 2_000;
export const UNSEEN = 6_000;

/**
 * Checks a done job until its changes have landed, as the page's CSS updates
 * (hot reload can come a moment after the agent's "done"): on every
 * stylesheet change in the document's head and every half second, for up to
 * SETTLE_TIME, or until what differs has stayed so a while (QUIET, UNSEEN). Each change that landed (or can't be checked) is settled right
 * away: its preview goes, and what shows is the real code. What still differs
 * at the end is left previewed: `onFinish` gets every change's outcome, and
 * the session decides (one follow-up to the agent, then it accepts the code).
 */
export function watchJob(
  history: EditHistory,
  jobId: string,
  onFinish: (results: ChangeResult[]) => void,
  options: { settleTime?: number; interval?: number; quiet?: number; unseen?: number } = {},
): () => void {
  const { settleTime = SETTLE_TIME, interval = 500, quiet = QUIET, unseen = UNSEEN } = options;
  const outcomes = new Map<string, ChangeResult>();
  // Since when the outcome is what it is, and whether the page's CSS changed meanwhile (see QUIET).
  let since = Date.now();
  let reloaded = false;
  let last = "";
  const keyOf = (r: { selector: string; property: string }) => `${r.selector}|${r.property}`;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    stop();
    onFinish([...outcomes.values()]);
  };
  const run = () => {
    if (finished) return;
    const check = checkJob(history, jobId);
    // The latest outcome of each change (a settled one isn't checked again).
    for (const r of check.results) outcomes.set(keyOf(r), r);
    if (check.landed.length || check.unchecked.length) {
      history.settle(jobId, (c) => check.differs.some((d) => same(d, c)));
    }
    if (!check.differs.length) return finish();
    const now = JSON.stringify([...outcomes.values()]);
    if (now !== last) {
      last = now;
      since = Date.now();
    }
    if (Date.now() - since >= (reloaded ? quiet : unseen)) finish();
  };
  const pageChanged = () => {
    reloaded = true;
    since = Date.now();
    run();
  };
  // The page's own stylesheets changing (hot reload).
  const observer =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver((records) => {
          if (records.some(isPageMutation)) pageChanged();
        })
      : null;
  observer?.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
  // A <link> stylesheet that finished loading.
  const onLoad = (e: Event) => {
    if (e.target instanceof HTMLLinkElement) pageChanged();
  };
  document.addEventListener("load", onLoad, true);
  const timer = setInterval(run, interval);
  const deadline = setTimeout(finish, settleTime);
  const stop = () => {
    observer?.disconnect();
    document.removeEventListener("load", onLoad, true);
    clearInterval(timer);
    clearTimeout(deadline);
  };
  run();
  return () => {
    finished = true;
    stop();
  };
}

function same(a: RecordedChange, b: RecordedChange): boolean {
  return (
    a.element === b.element &&
    a.property === b.property &&
    a.widths?.min === b.widths?.min &&
    a.widths?.max === b.widths?.max &&
    sameStates(a.states, b.states) &&
    sameCondition(a.condition, b.condition)
  );
}

/**
 * A job waiting for the designer's answer, when another job goes on its
 * elements: what it already landed leaves the history now (as a check
 * would), so the other job's code can't later show as a difference on it
 * and get a follow-up undoing it. The rest (what the question is about,
 * what can't be checked now) stays the job's, for after the answer.
 */
export function settleLanded(history: EditHistory, jobId: string): void {
  const { landed } = checkJob(history, jobId);
  if (landed.length) history.settle(jobId, (c) => !landed.some((l) => same(l, c)));
}
