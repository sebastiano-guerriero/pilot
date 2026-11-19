import type { ChangeResult } from "@pilot/protocol";
import { PREVIEW_ATTRIBUTE } from "../dom/preview.ts";
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
  const checkable = changes.filter((c) => c.element.isConnected && !c.states?.length && inWidths(c.widths ?? null, width));
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
    } else if (actual[i] === expected[i]) {
      check.landed.push(c);
      check.results.push({ ...base, outcome: "landed" });
    } else {
      check.differs.push(c);
      check.results.push({ ...base, outcome: "differs", actual: actual[i] });
    }
  }
  return check;
}

function computed(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property).trim();
}

/** How long after the agent's "done" Pilot keeps checking, while hot reload brings the new CSS in. */
export const SETTLE_TIME = 15_000;

/**
 * Checks a done job until its changes have landed, as the page's CSS updates
 * (hot reload can come a moment after the agent's "done"): on every
 * stylesheet change in the document's head and every half second, for up to
 * SETTLE_TIME. Each change that landed (or can't be checked) is settled right
 * away: its preview goes, and what shows is the real code. What still differs
 * at the end is left previewed: `onFinish` gets every change's outcome, and
 * the session decides (one follow-up to the agent, then it accepts the code).
 */
export function watchJob(
  history: EditHistory,
  jobId: string,
  onFinish: (results: ChangeResult[]) => void,
  options: { settleTime?: number; interval?: number } = {},
): () => void {
  const { settleTime = SETTLE_TIME, interval = 500 } = options;
  const outcomes = new Map<string, ChangeResult>();
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
    if (!check.differs.length) finish();
  };
  // The page's own stylesheets changing (hot reload).
  const observer =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver((records) => {
          if (records.some(isPageMutation)) run();
        })
      : null;
  observer?.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
  // A <link> stylesheet that finished loading.
  const onLoad = (e: Event) => {
    if (e.target instanceof HTMLLinkElement) run();
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

/**
 * A change in the head that's the page's, not Pilot's. Pilot's preview sheet
 * lives in the head too, and every check rewrites it: if those rewrites
 * counted, each check would trigger the next one, forever.
 */
export function isPageMutation(r: Pick<MutationRecord, "type" | "target" | "addedNodes" | "removedNodes">): boolean {
  const ours = (node: Node | null) => !!(node instanceof Element ? node : node?.parentElement)?.closest(`[${PREVIEW_ATTRIBUTE}]`);
  if (ours(r.target)) return false;
  return r.type !== "childList" || [...r.addedNodes, ...r.removedNodes].some((n) => !ours(n));
}

function same(a: RecordedChange, b: RecordedChange): boolean {
  return a.element === b.element && a.property === b.property && a.widths?.min === b.widths?.min && a.widths?.max === b.widths?.max;
}
