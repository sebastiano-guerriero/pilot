import type { WidthCheck, WidthReport } from "@pilot/protocol";
import { describe } from "../dom/domTree.ts";

/**
 * Pilot's width check, for a task about one element (Make responsive): Pilot
 * lays the page out at each viewport width in a hidden frame and measures
 * the element there, so the agent gets numbers instead of screenshots.
 * - The frame holds a **copy of the page as the designer has it** (its HTML
 *   and styles, an open modal included), with scripts off: no analytics,
 *   requests or sockets run, nothing reloads. Pilot's previews and UI are
 *   left out, so it measures the code. Layout that only changes through
 *   JavaScript (a menu a script toggles, components measuring themselves)
 *   doesn't respond in it.
 * - When the copy doesn't have the element (shadow DOM, say), the frame
 *   loads the page's URL instead, once.
 * - Either way it's one frame, resized from width to width: media queries
 *   follow the frame's width.
 *
 * It looks for:
 * - problems: the element (or something in it) sticking out of the viewport
 *   or out of its parent, clipping its content, overlapping a sibling;
 * - notes: content scrolling sideways in a scroll container (often the
 *   intended fix, for a table), tap targets under 24px on touch widths, the
 *   page scrolling sideways because of other elements.
 * Problems the element already has at the designer's width are left out:
 * the designer sees that width as it is. At that width Pilot also records
 * the computed styles of the element and what's in it, before the job
 * (`snapshotAt`) and after (in `checkWidths`), and lists what changed.
 *
 * The frame is named PROBE_NAME, so Pilot doesn't mount inside it when it
 * loads the URL (mount.tsx). Same origin only: the page the task was asked on.
 */

/** The name of the frames Pilot loads the page in: Pilot doesn't mount there. */
export const PROBE_NAME = "pilot-probe";

/** A narrow phone and a wide desktop: always checked. */
const PHONE = 375;
const DESKTOP = 1440;
/** The frames' height: a laptop's viewport. */
const FRAME_HEIGHT = 800;
/** Widths at most; past that, the "just below a breakpoint" ones go. */
const MAX_WIDTHS = 12;
/** Pilot's own element on the page (mount.tsx's HOST_TAG): left out of the copy. */
const PILOT_HOST = "pilot-root";
/** Pilot's preview stylesheet (dom/preview.ts' PREVIEW_ATTRIBUTE): left out of the copy, which measures the code. */
const PREVIEW_STYLES = "style[data-pilot-preview]";
/** The elements measured at most (the element first, then what's in it, in document order). */
const MAX_ELEMENTS = 600;
/** Under this width, it's a touch screen: small tap targets get a note. */
const TOUCH_WIDTH = 768;
/** WCAG 2.2's minimum target size. */
const MIN_TARGET = 24;
/** What "changed at the designer's width" compares. */
const STYLE_PROPS = [
  "display",
  "position",
  "flex-direction",
  "flex-wrap",
  "grid-template-columns",
  "grid-template-rows",
  "column-gap",
  "row-gap",
  "justify-content",
  "align-items",
  "order",
  "width",
  "height",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "font-size",
  "line-height",
  "font-weight",
  "letter-spacing",
  "text-align",
  "visibility",
] as const;

/** The computed styles of the element and what's in it, in document order. */
export interface StyleSnapshot {
  width: number;
  elements: Array<{ label: string; styles: Record<string, string> }>;
}

/** The widths to check: a phone, each breakpoint and 1px below it, a wide desktop, and the designer's. */
export function widthsToCheck(breakpoints: readonly number[], designerWidth: number): number[] {
  const within = (w: number) => w >= 320 && w <= 2560;
  const sorted = (ws: number[]) => [...new Set(ws)].filter(within).sort((a, b) => a - b);
  const all = sorted([PHONE, DESKTOP, designerWidth, ...breakpoints.flatMap((b) => [b - 1, b])]);
  return all.length <= MAX_WIDTHS ? all : sorted([PHONE, DESKTOP, designerWidth, ...breakpoints]).slice(0, MAX_WIDTHS);
}

/** Whether this window is one of Pilot's frames (then Pilot doesn't mount). */
export function isProbeFrame(): boolean {
  try {
    return window.name === PROBE_NAME;
  } catch {
    return false;
  }
}

/** The element's styles at the designer's width, before the job (null when it can't find it). */
export async function snapshotAt(url: string, selector: string, width: number): Promise<StyleSnapshot | null> {
  const laid = await atWidths(url, selector, [width], (doc) => {
    const root = doc.querySelector(selector);
    return root ? snapshot(root, width) : null;
  });
  return laid?.results.get(width) ?? null;
}

/**
 * The width check of `selector` at `widths` (which include the designer's),
 * against the `baseline` taken before the job, when there's one.
 */
export async function checkWidths(
  url: string,
  selector: string,
  widths: readonly number[],
  designerWidth: number,
  baseline?: StyleSnapshot | null,
): Promise<WidthCheck> {
  let after: StyleSnapshot | null = null;
  const laid = await atWidths(url, selector, widths, (doc, width) => {
    if (width === designerWidth) {
      const root = doc.querySelector(selector);
      if (root) after = snapshot(root, width);
    }
    return measure(doc, selector, width);
  });
  const measured = new Map<number, Measured>(laid?.results ?? []);
  return buildCheck(selector, widths, designerWidth, measured, baseline ? compareSnapshots(baseline, after) : undefined, laid?.source);
}

/** One width, measured. Problems have a key (kind and element), to leave out the ones the designer's width has too. */
export interface Measured {
  found: boolean;
  size?: string;
  layout?: string;
  problems: Array<{ key: string; text: string }>;
  notes: string[];
}

/** The reports, without the problems the designer's width has too. */
export function buildCheck(
  selector: string,
  widths: readonly number[],
  designerWidth: number,
  measured: Map<number, Measured>,
  changedAtDesignerWidth?: string[],
  source?: PageSource,
): WidthCheck {
  const accepted = new Set(measured.get(designerWidth)?.problems.map((p) => p.key) ?? []);
  const reports: WidthReport[] = widths.map((width) => {
    const m = measured.get(width) ?? { found: false, problems: [], notes: [] };
    const issues = width === designerWidth ? [] : m.problems.filter((p) => !accepted.has(p.key)).map((p) => p.text);
    return { width, found: m.found, size: m.size, layout: m.layout, issues, notes: m.notes };
  });
  const missing = reports.filter((r) => !r.found).length;
  const problems = reports.reduce((n, r) => n + r.issues.length, 0) + (changedAtDesignerWidth?.length ?? 0) + missing;
  return {
    selector,
    designerWidth,
    widths: reports,
    ...(changedAtDesignerWidth?.length && { changedAtDesignerWidth }),
    ...(source && { source }),
    problems,
  };
}

/** The check's problems as lines, for a follow-up (`375px: …`). */
export function problemLines(check: WidthCheck): string[] {
  const lines: string[] = [];
  for (const r of check.widths) {
    if (!r.found) lines.push(`${r.width}px: the element isn't found at this width.`);
    for (const issue of r.issues) lines.push(`${r.width}px: ${issue}`);
  }
  for (const c of check.changedAtDesignerWidth ?? []) lines.push(`At the designer's width (${check.designerWidth}px), changed: ${c}`);
  return lines;
}

// Measuring

/** The element and what's in it at one width, in a document laid out at that width. */
export function measure(doc: Document, selector: string, width: number): Measured {
  const root = doc.querySelector(selector);
  if (!root) return { found: false, problems: [], notes: [] };
  const win = doc.defaultView as Window;
  const style = (el: Element) => win.getComputedStyle(el);
  const elements = [root, ...Array.from(root.querySelectorAll("*")).slice(0, MAX_ELEMENTS - 1)];
  const index = new Map(elements.map((el, i) => [el, i]));
  const label = (el: Element) => labelOf(el, el === root);
  const vw = doc.documentElement.clientWidth;
  const problems: Measured["problems"] = [];
  const notes: string[] = [];
  const shown = (el: Element) => el.getClientRects().length > 0 && style(el).display !== "contents";
  const outOfFlow = (el: Element) => ["absolute", "fixed"].includes(style(el).position);
  // An ancestor (up to the body) that clips or scrolls sideways: what's inside doesn't stick out.
  const clipper = (el: Element): Element | null => {
    for (let p = el.parentElement; p && p !== doc.body && p !== doc.documentElement; p = p.parentElement) {
      if (style(p).overflowX !== "visible") return p;
    }
    return null;
  };
  // Report the outermost element only: what's inside an offender sticks out with it.
  const sticking = new Set<Element>();
  const spilling = new Set<Element>();

  for (const el of elements) {
    if (!shown(el)) continue;
    const i = index.get(el) as number;
    const cs = style(el);
    const rect = el.getBoundingClientRect();
    const parentIn = el.parentElement && index.has(el.parentElement) ? el.parentElement : null;

    // Sticking out of the viewport.
    if ((rect.right > vw + 1 || rect.left < -1) && !clipper(el) && cs.position !== "fixed") {
      if (!parentIn || !sticking.has(parentIn)) {
        const right = rect.right > vw + 1;
        const by = Math.round(right ? rect.right - vw : -rect.left);
        problems.push({
          key: `viewport:${i}`,
          text: `${label(el)} sticks out of the viewport ${by}px on the ${right ? "right" : "left"} (it's ${Math.round(rect.width)}px wide, the viewport ${vw}px).`,
        });
      }
      sticking.add(el);
    } else if (parentIn && !outOfFlow(el) && style(parentIn).overflowX === "visible") {
      // Spilling out of its parent.
      const p = parentIn.getBoundingClientRect();
      const by = Math.round(Math.max(rect.right - p.right, p.left - rect.left));
      if (by > 1 && rect.width > 0 && !sticking.has(parentIn)) {
        if (!spilling.has(parentIn)) problems.push({ key: `parent:${i}`, text: `${label(el)} spills ${by}px out of ${label(parentIn)}.` });
        spilling.add(el);
      }
    }

    // Clipped, or scrolling sideways inside.
    const hidden = el.scrollWidth - el.clientWidth;
    if (hidden > 1 && el.clientWidth > 0) {
      if (cs.overflowX === "hidden" || cs.overflowX === "clip") {
        const what = cs.textOverflow === "ellipsis" ? "cuts its text short (ellipsis)" : `clips ${hidden}px of its content`;
        problems.push({ key: `clip:${i}`, text: `${label(el)} ${what}.` });
      } else if (cs.overflowX === "auto" || cs.overflowX === "scroll") {
        notes.push(`${label(el)} scrolls sideways: ${el.scrollWidth}px of content in ${el.clientWidth}px.`);
      }
    }

    // Overlapping siblings (in the flow).
    if (!outOfFlow(el)) {
      const kids = Array.from(el.children).filter((k) => index.has(k) && shown(k) && !outOfFlow(k)).slice(0, 40);
      for (let a = 0; a < kids.length; a++) {
        for (let b = a + 1; b < kids.length; b++) {
          const ka = kids[a] as Element;
          const kb = kids[b] as Element;
          const ra = ka.getBoundingClientRect();
          const rb = kb.getBoundingClientRect();
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (w > 2 && h > 2) {
            problems.push({ key: `overlap:${index.get(ka)}:${index.get(kb)}`, text: `${label(ka)} and ${label(kb)} overlap (${Math.round(w)}×${Math.round(h)}px).` });
          }
        }
      }
    }

    // Small tap targets on touch widths.
    if (width < TOUCH_WIDTH && isTarget(el) && (rect.width < MIN_TARGET || rect.height < MIN_TARGET)) {
      notes.push(`${label(el)} is a ${Math.round(rect.width)}×${Math.round(rect.height)}px tap target (under ${MIN_TARGET}px).`);
    }
  }

  if (doc.documentElement.scrollWidth > vw + 1 && !problems.some((p) => p.key.startsWith("viewport:"))) {
    notes.push(`The page scrolls sideways at this width because of other elements, not this one (${doc.documentElement.scrollWidth}px wide).`);
  }

  const rect = root.getBoundingClientRect();
  return { found: true, size: `${Math.round(rect.width)}×${Math.round(rect.height)}`, layout: layoutOf(style(root)), problems, notes };
}

/** `grid, 3 columns`, `flex row, wraps`, `block`. */
function layoutOf(cs: CSSStyleDeclaration): string {
  if (cs.display.includes("grid")) {
    const columns = cs.gridTemplateColumns.split(/\s+(?![^(]*\))/).filter((t) => t && t !== "none").length;
    return columns ? `grid, ${columns} ${columns === 1 ? "column" : "columns"}` : "grid";
  }
  if (cs.display.includes("flex")) return `flex ${cs.flexDirection}${cs.flexWrap === "wrap" ? ", wraps" : ""}`;
  return cs.display;
}

/** The text inside an element, its pieces joined by spaces (`<li>` after `<li>` doesn't run together). */
function textInside(el: Element): string {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n && parts.join(" ").length < 60; n = walker.nextNode()) {
    const t = (n.nodeValue ?? "").replace(/\s+/g, " ").trim();
    if (t) parts.push(t);
  }
  return parts.join(" ");
}

function isTarget(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "input") return (el as HTMLInputElement).type !== "hidden";
  return ["a", "button", "select", "textarea", "summary"].includes(tag) || el.getAttribute("role") === "button";
}

/**
 * How the agent finds an element: `` `a.rounded-lg.bg-brand` "Start free trial" ``,
 * with the text inside it when it has none of its own, and which one it is
 * when its siblings look the same (`2 of 3`). The selected one says so.
 */
function labelOf(el: Element, isRoot: boolean): string {
  const { tag, identifiers, text } = describe(el);
  const classes = Array.from(el.classList).slice(0, 3).map((c) => `.${c}`).join("");
  const inside = text ?? textInside(el);
  const words = inside ? ` "${inside.length > 40 ? `${inside.slice(0, 39)}…` : inside}"` : "";
  const alike = el.parentElement ? Array.from(el.parentElement.children).filter((s) => s.tagName === el.tagName && s.className === el.className) : [];
  const which = alike.length > 1 ? ` (${alike.indexOf(el) + 1} of ${alike.length})` : "";
  return `\`${tag}${identifiers ?? ""}${classes}\`${words}${which}${isRoot ? " (the element)" : ""}`;
}

// Styles at the designer's width

function snapshot(root: Element, width: number): StyleSnapshot {
  const win = root.ownerDocument.defaultView as Window;
  const elements = [root, ...Array.from(root.querySelectorAll("*")).slice(0, MAX_ELEMENTS - 1)];
  return {
    width,
    elements: elements.map((el) => {
      const cs = win.getComputedStyle(el);
      const styles: Record<string, string> = {};
      for (const p of STYLE_PROPS) styles[p] = cs.getPropertyValue(p);
      return { label: labelOf(el, el === root), styles };
    }),
  };
}

/** What changed between two snapshots at the same width: `` `div.grid` grid-template-columns: 1fr 1fr → 1fr ``. */
export function compareSnapshots(before: StyleSnapshot, after: StyleSnapshot | null): string[] {
  if (!after) return ["the element isn't found there anymore."];
  const out: string[] = [];
  if (before.elements.length !== after.elements.length) {
    out.push(`what's inside the element changed: ${before.elements.length} elements before, ${after.elements.length} now.`);
    return out;
  }
  before.elements.forEach((b, i) => {
    const a = after.elements[i];
    if (!a) return;
    for (const p of STYLE_PROPS) {
      if (b.styles[p] !== a.styles[p]) out.push(`${a.label} ${p}: ${b.styles[p] || "—"} → ${a.styles[p] || "—"}`);
    }
  });
  return out.slice(0, 20);
}

// The frame

/** How the check got the page: a copy of it as the designer has it (scripts off), or loaded from its URL (the fallback). */
export type PageSource = "copy" | "load";

/**
 * The page laid out at each of `widths` in one hidden frame, resized from
 * width to width, `fn` run at each: the copy of the page (see pageCopy), or,
 * when the copy doesn't have `selector`, the page loaded from `url`, once.
 * Null when neither has it in time.
 */
async function atWidths<T>(
  url: string,
  selector: string,
  widths: readonly number[],
  fn: (doc: Document, width: number) => T,
): Promise<{ source: PageSource; results: Map<number, T> } | null> {
  for (const source of ["copy", "load"] as const) {
    const frame = probeFrame(widths[0] ?? DESKTOP, source);
    try {
      const doc = await (source === "copy" ? openCopy(frame, selector) : openUrl(frame, url, selector));
      if (!doc) continue;
      const results = new Map<number, T>();
      for (const width of widths) {
        frame.style.width = `${width}px`;
        await settle(source);
        results.set(width, fn(doc, width));
      }
      return { source, results };
    } catch {
      // The next way, or none.
    } finally {
      frame.remove();
    }
  }
  return null;
}

/** A hidden frame, off screen, `width` wide; for the copy, with scripts off (sandboxed, same origin so Pilot can measure it). */
function probeFrame(width: number, source: PageSource): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.name = PROBE_NAME;
  if (source === "copy") frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    top: "0",
    left: "-100000px",
    width: `${width}px`,
    height: `${FRAME_HEIGHT}px`,
    border: "0",
    visibility: "hidden",
    pointerEvents: "none",
  });
  return frame;
}

/** The copy of the page in `frame`, once its stylesheets, images and fonts are in; null when it doesn't have `selector`. */
async function openCopy(frame: HTMLIFrameElement, selector: string): Promise<Document | null> {
  const loaded = loadOf(frame);
  frame.srcdoc = pageCopy();
  document.documentElement.append(frame);
  if (!(await within(loaded, 15_000))) return null;
  const doc = frame.contentDocument;
  if (!doc?.querySelector(selector)) return null;
  await within(doc.fonts?.ready ?? Promise.resolve(), 2_000);
  return doc;
}

/** The page loaded from `url` in `frame` (scripts on), once `selector` is there (the app may render after load). */
async function openUrl(frame: HTMLIFrameElement, url: string, selector: string): Promise<Document | null> {
  const loaded = loadOf(frame);
  frame.src = url;
  document.documentElement.append(frame);
  if (!(await within(loaded, 15_000))) return null;
  const doc = frame.contentDocument;
  if (!doc) return null;
  for (let t = 0; t < 40 && !doc.querySelector(selector); t++) await sleep(100);
  if (!doc.querySelector(selector)) return null;
  await within(doc.fonts?.ready ?? Promise.resolve(), 2_000);
  return doc;
}

/**
 * The page as the designer has it now, as an HTML document to put in a
 * frame: its elements (state included: an open modal, classes and inline
 * styles set by scripts), without scripts, Pilot's UI, its previews (the
 * check measures the code) or Pilot's other frames. Styles a script added
 * through the CSSOM (CSS-in-JS), which a `<style>`'s text doesn't hold, are
 * written out, and so are adopted stylesheets. A `<base>` keeps relative
 * URLs (stylesheets, images, fonts) pointing where they did.
 */
export function pageCopy(source: Document = document): string {
  const root = source.documentElement.cloneNode(true) as HTMLElement;
  // CSSOM rules: paired with the copy's <style>s before anything is removed (same order).
  const live = Array.from(source.querySelectorAll("style"));
  const copied = Array.from(root.querySelectorAll("style"));
  live.forEach((style, i) => {
    const target = copied[i];
    const text = rulesOf(style.sheet);
    if (target && text && !style.textContent?.trim()) target.textContent = text;
  });
  for (const el of root.querySelectorAll(`script, noscript, ${PILOT_HOST}, iframe[name="${PROBE_NAME}"], ${PREVIEW_STYLES}`)) el.remove();
  const head = root.querySelector("head") ?? root.insertBefore(source.createElement("head"), root.firstChild);
  const adopted = (source.adoptedStyleSheets ?? []).map(rulesOf).filter(Boolean).join("\n");
  if (adopted) {
    const style = source.createElement("style");
    style.textContent = adopted;
    head.append(style);
  }
  if (!head.querySelector("base")) {
    const base = source.createElement("base");
    base.href = source.location?.href ?? "";
    head.prepend(base);
  }
  return `<!doctype html>${root.outerHTML}`;
}

/** A stylesheet's rules as text ("" when they can't be read: another origin's). */
function rulesOf(sheet: CSSStyleSheet | null | undefined): string {
  try {
    return sheet ? Array.from(sheet.cssRules, (r) => r.cssText).join("\n") : "";
  } catch {
    return "";
  }
}

/** After a resize: the frame laid out at its new width (and, with scripts on, a moment for them to react). */
async function settle(source: PageSource): Promise<void> {
  await within(new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), 100);
  if (source === "load") await sleep(100);
}

function loadOf(frame: HTMLIFrameElement): Promise<void> {
  return new Promise<void>((resolve) => frame.addEventListener("load", () => resolve(), { once: true }));
}

function within(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return Promise.race([promise.then(() => true), sleep(ms).then(() => false)]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
