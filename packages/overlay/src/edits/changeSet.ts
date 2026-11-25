import type { AgentRequest, ChangeSet, CommentAttachment, CommentMessage, CommentReference, ElementEdit, FileTokenUse, ElementTarget, StyleChange } from "@pilot/protocol";
import { pageBreakpoints } from "../dom/breakpoints.ts";
import { componentProps } from "../dom/component.ts";
import { fileTokensNow } from "../dom/tokens.ts";
import { declaredValue } from "../dom/declared.ts";
import { equivalentsOf } from "../dom/equivalents.ts";
import { currentStyle, tokensNow } from "../dom/currentStyle.ts";
import { similarOf } from "../dom/similar.ts";
import { describeElement } from "../dom/target.ts";
import { normalizeText, textRunOf } from "../dom/text.ts";
import { sourceOf } from "./clear.ts";
import type { EditHistory, RecordedChange } from "./history.ts";

/**
 * The change set for what's in the history now: one edit per element, in the
 * order they were first changed, each with its changes in effect.
 * - `from` is the page's own value, as declared in its CSS (Pilot's preview
 *   is left out of declared values), or "" when the page doesn't set it; with
 *   `source`, where it's declared (a rule's selector, how many elements it
 *   matches, its @media).
 * - A removal says so (`removed`), with the removed value and its source.
 * - `widths`, when the change is for some widths only.
 * - `equivalents`: the page's tokens and classes that give the new value now.
 * - Text changes are the edit's `texts`: per text run, the page's own text and the new one.
 * Elements still on the page are described afresh; one that isn't (another
 * page of the app, or re-rendered) keeps the description taken when it was
 * first changed. `unsent`: only the changes not sent to the agent yet (what
 * Send hands over). `only`: just the
 * changes it picks (Send leaves out the ones that wait for a job).
 */
export function buildChangeSet(
  history: EditHistory,
  options: { unsent?: boolean; id?: string; only?: (change: RecordedChange) => boolean } = {},
): ChangeSet {
  const edits = new Map<Element, ElementEdit>();
  for (const change of history.changes({ unsent: options.unsent })) {
    if (options.only && !options.only(change)) continue;
    const { element, property, value, removal, widths, states } = change;
    let edit = edits.get(element);
    if (!edit) {
      edit = { target: element.isConnected ? describeElement(element) : change.target, changes: [] };
      edits.set(element, edit);
    }
    const run = textRunOf(property);
    if (run !== null) {
      const from = element.isConnected ? history.pageText(element, run) : (change.from ?? "");
      (edit.texts ??= []).push({ from: normalizeText(from), to: normalizeText(value) });
      continue;
    }
    const page = removal ? null : element.isConnected ? declaredValue(element, property, states) : null;
    const styleChange: StyleChange = removal
      ? { property, from: removal.from, to: "", removed: true, source: removal.source }
      : { property, from: page?.value ?? "", to: value, ...(page && { source: sourceOf(element, page) }) };
    if (widths) styleChange.widths = widths;
    if (states?.length) styleChange.states = states;
    const equivalents = removal ? null : equivalentsOf(property, value);
    if (equivalents) styleChange.equivalents = equivalents;
    edit.changes.push(styleChange);
  }
  withLookAlikes(edits);
  return {
    id: options.id ?? `cs_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    page: {
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    edits: [...edits.values()],
    ...fileTokensOf([...edits.values()]),
  };
}

/** The page's tokens, for a request's ChangeSet.tokens; nothing when it has none. */
function tokensOf(): { tokens?: ReturnType<typeof tokensNow> } {
  const tokens = tokensNow();
  return tokens.length ? { tokens } : {};
}

/**
 * The file tokens (Pilot's variables for the project's token files, see
 * setFileTokens) the edits' values use, as `fileTokens` for the prompt;
 * nothing when they use none.
 */
export function fileTokensOf(edits: readonly ElementEdit[]): { fileTokens?: FileTokenUse[] } {
  const used = new Set(edits.flatMap((e) => e.changes.flatMap((c) => [...c.to.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] as string))));
  const fileTokens = fileTokensNow()
    .filter((t) => t.source && used.has(t.name))
    .map((t) => ({ variable: t.name, name: t.source?.name as string, value: t.value, file: t.source?.file as string, ...(t.source?.line ? { line: t.source.line } : {}) }));
  return fileTokens.length ? { fileTokens } : {};
}

/**
 * A task for the agent about one element, as a change set with no edits
 * (see AgentRequest), with the page's breakpoints: Make responsive, or a
 * comment with its `thread` (the designer's latest message last).
 */
export function buildRequest(
  element: Element,
  kind: AgentRequest["kind"],
  options: {
    id?: string;
    thread?: CommentMessage[];
    note?: string;
    attachments?: CommentAttachment[];
    references?: CommentReference[];
    others?: Element[];
  } = {},
): ChangeSet {
  // Several selected together: one request about all of them, `element` first.
  const selected = [element, ...(options.others ?? []).filter((e) => e !== element)];
  // Its style now, for what the comment or task changes (see currentStyle); `/props` changes props.
  const styled = (e: Element) => (kind === "props" ? {} : { style: currentStyle(e) });
  const [target, ...others] = selected.map((e) => ({ ...describeElement(e), ...lookAlikes(e, selected), ...styled(e) })) as [
    ElementTarget,
    ...ElementTarget[],
  ];
  const several = others.length ? { others } : {};
  const breakpoints = pageBreakpoints();
  const extras = {
    ...(options.attachments?.length ? { attachments: options.attachments } : {}),
    ...(options.references?.length ? { references: options.references } : {}),
  };
  // `/props`: the instance's props as the page has them now, and where it's written.
  const instance = kind === "props" ? componentProps(element) : null;
  const request: AgentRequest =
    kind === "comment"
      ? { kind, target, ...several, breakpoints, thread: options.thread ?? [] }
      : kind === "props"
        ? {
            kind,
            target,
            ...several,
            breakpoints,
            component: instance?.component ?? target.source?.component ?? target.tag,
            current: instance?.props ?? {},
            ...(instance?.usedIn ? { usedIn: instance.usedIn } : {}),
            ...extras,
          }
        : { kind, target, ...several, breakpoints, ...extras };
  return {
    id: options.id ?? `cs_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    page: {
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    edits: [],
    request,
    ...(kind === "props" ? {} : tokensOf()),
    ...(options.note?.trim() ? { note: options.note.trim() } : {}),
  };
}

/**
 * How many elements like each one (dom/similar.ts) the job leaves out: the
 * agent asks before changing shared code the designer changed in only some
 * copies (ElementTarget.lookAlikes).
 */
function withLookAlikes(edits: Map<Element, ElementEdit>): void {
  const elements = [...edits.keys()];
  for (const [element, edit] of edits) if (element.isConnected) Object.assign(edit.target, lookAlikes(element, elements));
}

function lookAlikes(element: Element, inJob: readonly Element[]): Pick<ElementTarget, "lookAlikes" | "lookAlikesOf" | "everyCopy"> {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return {};
  const similar = similarOf(element);
  const n = similar.elements.filter((e) => !inJob.includes(e)).length;
  if (n) return { lookAlikes: n, ...(similar.component ? { lookAlikesOf: similar.component } : {}) };
  // Every one in the job (Select similar): a component's instances mean the component, everywhere it's
  // used; copies matched by structure (plain HTML) stay on this page (the owner's call).
  return similar.elements.length ? { everyCopy: similar.component ? { of: similar.component } : {} } : {};
}

/**
 * Put `text` on the clipboard. The async Clipboard API where it's allowed
 * (localhost and https), else the old copy command through a hidden textarea.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}
