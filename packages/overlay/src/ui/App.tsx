import type { ElementState, WidthRange } from "@pilot/protocol";
import { useCallback, useEffect, useReducer, useRef, useState } from "preact/hooks";
import { type BoxArea, hidesSelection } from "../dom/boxModel.ts";
import { type EditableElement, isEditable } from "../dom/target.ts";
import { formatPrompt } from "@pilot/protocol";
import { buildChangeSet, buildRequest, copyText } from "../edits/changeSet.ts";
import { type EditHistory, historyShortcut } from "../edits/history.ts";
import { clickWidth } from "../edits/widths.ts";
import type { PilotDevOptions } from "../mount.tsx";
import { useElementPicker } from "../select/useElementPicker.ts";
import { useElementRect } from "../select/useElementRect.ts";
import { BoxAreas } from "./components/BoxAreas/BoxAreas.tsx";
import { GridOverlay } from "./components/GridOverlay/GridOverlay.tsx";
import { Highlight } from "./components/Highlight/Highlight.tsx";
import { PropertyDialog, type WidthPick } from "./components/PropertyDialog/PropertyDialog.tsx";
import type { CommentThread, JobRecord, PilotSession } from "../bridge/session.ts";
import { statusText, whatText } from "./components/JobList/JobList.tsx";
import { DomTree } from "./components/DomTree/DomTree.tsx";
import { actionsBox, type Busy, type RequestOutcome, SelectionActions } from "./components/SelectionActions/SelectionActions.tsx";
import { type CommentOutcome, CommentWidget } from "./components/CommentWidget/CommentWidget.tsx";
import { type Tool, Toolbar } from "./components/Toolbar/Toolbar.tsx";
import { ViewportWidth } from "./components/ViewportWidth/ViewportWidth.tsx";
import { loadSpot, saveSpot, type ToolbarSpot } from "./toolbarSpot.ts";
import { useViewportWidth } from "./useViewportWidth.ts";

interface AppProps {
  /** Pilot's Shadow DOM host, so the picker can ignore events from Pilot's own UI. */
  host: HTMLElement;
  /** See `PilotOptions.dev`: start with an element selected and the dialog open. */
  dev?: PilotDevOptions;
  /** See `PilotOptions.nameAttributes`: how the selection label names elements. */
  nameAttributes?: readonly string[];
  /**
   * Where changes are recorded: one per page load, owned by mountPilot so it
   * outlives quitting and is restored after a reload (edits/persist.ts).
   */
  history: EditHistory;
  /** The handoff to agents (Send, jobs). None: Copy prompt only. */
  session?: PilotSession;
  /** Find again the elements of changes that aren't on the page (see EditHistory.reattach). */
  onReattach?(): void;
  onQuit(): void;
}

/**
 * Pilot while running.
 * - Cursor on: Pilot owns page clicks. Hover shows an outline, a click selects,
 *   and the property dialog opens next to the selected element. Clicking
 *   another element re-selects; Esc clears the selection.
 * - Cursor off: the page behaves normally again and the selection is cleared.
 */
export function App({ host, dev, nameAttributes, history, session, onReattach, onQuit }: AppProps) {
  // The tool that picks elements: Select (the property dialog) or Comment
  // (the comment widget); null: the page as it is.
  const [tool, setTool] = useState<Tool>(dev ? "select" : null);
  const selecting = tool !== null;
  const commenting = tool === "comment";
  // `from: "dom"`: picked in the DOM tree, which keeps focus (the dialog doesn't take it).
  const [selected, setSelected] = useState<{ element: EditableElement; key: number; from?: "dom" } | null>(() => {
    if (!dev) return null;
    const element = document.querySelector(dev.select);
    if (isEditable(element)) return { element, key: 1 };
    console.warn(`[pilot] dev.select "${dev.select}" matched no element.`);
    return null;
  });

  // The search carries over from one selection to the next: set col-span on
  // one card, click the next, and the same editor is already there. It starts
  // empty again once nothing is selected (Esc, the cursor off, the dialog closed).
  const lastQuery = useRef(dev?.query ?? "");
  useEffect(() => {
    if (!selected) lastQuery.current = "";
  }, [selected]);

  // The width chip: the viewport widths changes are for (null: every width).
  // Set in the search (`from-1200 `) or by clicking the viewport width; it
  // stays, across selections and with nothing selected, until it's removed.
  const [widths, setWidths] = useState<WidthRange | null>(null);
  // The state pills: the element states changes are for, together. Kept across selections, like the chip.
  const [states, setStates] = useState<ElementState[]>([]);
  const viewportWidth = useViewportWidth();
  // A click on the viewport width. With the dialog open, it goes to the
  // dialog, which sets the chip (a `from`/`to` typed in the search decides it).
  const [widthPick, setWidthPick] = useState<WidthPick | undefined>();

  const onPick = useCallback((element: EditableElement) => {
    onReattach?.(); // the page may have re-rendered since: changes find their elements again
    setSelected((prev) => (prev?.element === element ? prev : { element, key: (prev?.key ?? 0) + 1 }));
  }, []);

  // The DOM tree: the page's elements as a tree, to select any of them
  // (Alt+D, or the selection's Show in DOM action). Hovering a row highlights its
  // element; picking one selects it, scrolled into view.
  const [domOpen, setDomOpen] = useState(false);
  const [domHover, setDomHover] = useState<Element | null>(null);
  const pickFromDom = useCallback((element: Element) => {
    if (!isEditable(element)) return;
    onReattach?.();
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    setSelected((prev) => (prev?.element === element ? prev : { element, key: (prev?.key ?? 0) + 1, from: "dom" }));
  }, []);
  useEffect(() => {
    if (!domOpen) setDomHover(null);
  }, [domOpen]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.code !== "KeyD") return;
      // Typing a comment: Alt+D types a character there.
      if (e.composedPath()[0] instanceof HTMLTextAreaElement) return;
      // Not while typing in the page's own fields (Pilot's are fine: Alt+D types nothing there).
      if (!e.composedPath().includes(host) && isTextField(document.activeElement)) return;
      e.preventDefault();
      e.stopPropagation();
      setDomOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [host]);

  // Option+C and Option+V turn on Comment and Select (or off, when on), as
  // their toolbar buttons do; the selection stays. Alt with a key, like
  // Option+P and Alt+D, so plain keys stay the page's. Not while typing
  // (a comment, or the page's own fields).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const next = toolShortcut(e.code);
      if (!next) return;
      if (e.composedPath()[0] instanceof HTMLTextAreaElement) return;
      if (!e.composedPath().includes(host) && isTextField(document.activeElement)) return;
      e.preventDefault();
      e.stopPropagation();
      onToolRef.current(next);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [host]);

  // Areas of the selected element an editor wants shown (e.g. the padding
  // being hovered or dragged); while set, they replace the selection highlight.
  const [inspect, setInspect] = useState<BoxArea[] | null>(null);
  useEffect(() => setInspect(null), [selected?.key]);

  const [, refresh] = useReducer((n: number) => n + 1, 0);
  // How many changes there are to copy: the toolbar's button follows the history.
  const [changeCount, setChangeCount] = useState(() => history.changes().length);
  useEffect(() => history.subscribe(() => setChangeCount(history.changes().length)), [history]);
  // Copy prompt: the change set, as the text the agent gets (the same text the
  // MCP path will send: formatPrompt), on the clipboard.
  const copyPrompt = () => copyText(formatPrompt(buildChangeSet(history)));
  // The session's jobs and agents: re-render as they change.
  const [, setSessionTick] = useState(0);
  useEffect(() => session?.subscribe(() => setSessionTick((n) => n + 1)), [session]);
  useEffect(() => history.subscribe(() => setSessionTick((n) => n + 1)), [history]);
  // With an agent on this page, the button sends the changes not sent yet;
  // without one, it copies the prompt (everything in effect).
  const sendToAgent = !!session?.canSendToAgent;
  // What Send would send: the changes not sent yet, less those waiting for a
  // job on their element; Copy prompt copies everything in effect.
  const sendCount = sendToAgent ? (session?.unsent ?? 0) - (session?.heldCount ?? 0) : changeCount;
  // Send: what went, and what waits for a job still on its element (it goes once that's finished).
  const sendChanges = (): boolean | string => {
    if (!session) return false;
    const job = session.send();
    const held = session.heldCount > 0;
    if (job) return held ? "Sent; some wait for the agent" : true;
    return held ? "Sends when the agent is done" : false;
  };
  // The job on the selected element, if one isn't finished: its actions give way to where it stands.
  const selectedJob = selected && session ? session.jobOn(selected.element) : null;
  const busyOf = (job: JobRecord): Busy => ({
    text: jobText(job),
    onCancel: session?.canCancel(job) ? () => session.cancel(job.id) : undefined,
  });
  const selectedBusy = selectedJob ? busyOf(selectedJob) : undefined;
  // What shows on elements' top-right corners, selected or not: a job's
  // loader, and the comment icon of an unresolved thread (unless its
  // comment is with the agent: its loader says so then). Both come with the
  // element's outline.
  const marks = new Map<Element, { job?: JobRecord; thread?: CommentThread }>();
  for (const { element, job } of session?.busy ?? []) marks.set(element, { job });
  for (const thread of session?.threads ?? []) {
    const job = session?.threadJob(thread);
    if (job && job.status !== "cancelled" && !job.checked) continue; // with the agent
    const element = session?.threadElement(thread);
    if (element) marks.set(element, { ...marks.get(element), thread });
  }
  /** How many icons sit on `element`'s corner (the hover label stops before them). */
  const marksOn = (element: Element) => {
    const mark = marks.get(element);
    return Number(!!mark?.job) + Number(!!mark?.thread);
  };
  // Make responsive: a job of its own for the agent working on this page,
  // or, with none, its prompt on the clipboard (the same text either way).
  // Asked again while that element's job isn't finished: nothing new is
  // sent (the loader shows instead of the button by then anyway).
  const makeResponsive = async (element: Element): Promise<RequestOutcome> => {
    if (!sendToAgent) return (await copyText(formatPrompt(buildRequest(element, "responsive")))) ? "copied" : false;
    if (session?.openTask(element, "responsive")) return "open";
    return session?.request(element, "responsive") ? "sent" : false;
  };
  // Jobs not finished yet: waiting, an agent applying, checking the page.
  const pending = (session?.jobs ?? []).filter((j) => j.status === "queued" || j.status === "working" || (j.status === "done" && !j.checked)).length;
  // Where the designer dragged the toolbar (null: centered at the bottom), kept through reloads.
  const [toolbarSpot, setToolbarSpot] = useState<ToolbarSpot | null>(loadSpot);
  const moveToolbar = (spot: ToolbarSpot) => {
    setToolbarSpot(spot);
    saveSpot(spot);
  };
  // The toolbar's jobs button goes to the next job: its elements scrolled
  // into view (the first one, centered, unless all of it is in view), then
  // flashed. Oldest first, as the agents take them, wrapping around after
  // the last; jobs with no element on this page (made on another one, or
  // re-rendered away) are skipped.
  const lastJob = useRef<string | null>(null);
  const [flash, setFlash] = useState<{ elements: Element[]; key: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextJob = () => {
    if (!session) return;
    const open = session.openJobs.map((job) => ({ job, elements: session.elementsOf(job) })).filter((j) => j.elements.length);
    if (!open.length) return;
    const next = open[(open.findIndex((j) => j.job.id === lastJob.current) + 1) % open.length] as (typeof open)[number];
    lastJob.current = next.job.id;
    goTo(next.elements);
  };
  /** Scroll to `elements` (the first one), then flash them all. */
  const goTo = (elements: Element[]) => {
    void scrollTo(elements[0] as Element).then(() => {
      clearTimeout(flashTimer.current);
      setFlash((prev) => ({ elements, key: (prev?.key ?? 0) + 1 }));
      flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
    });
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Cmd/Ctrl+Z undoes the last property change, Cmd/Ctrl+Shift+Z (or Ctrl+Y)
  // redoes it. Left alone when there's nothing to undo/redo, and when the
  // user is typing in one of the page's own fields.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = historyShortcut(e);
      if (!action) return;
      // Typing a comment: the field's own undo.
      if (e.composedPath()[0] instanceof HTMLTextAreaElement) return;
      if (!e.composedPath().includes(host) && isTextField(document.activeElement)) return;
      if (action === "undo" ? history.undo() : history.redo()) {
        e.preventDefault();
        e.stopPropagation();
        refresh(0); // editors re-read the element's values
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [history, host]);

  const hovered = useElementPicker(selecting, host, onPick);
  const hoverRect = useElementRect(hovered !== selected?.element ? hovered : null);
  const selectedRect = useElementRect(selected?.element ?? null);
  const domHoverRect = useElementRect(domHover);

  // The selected element disappeared (re-render, HMR): drop the selection.
  useEffect(() => {
    if (selected && !selected.element.isConnected) setSelected(null);
  }, [selected, selectedRect]);

  // Esc that drops the selection (the dialog hides) closes the DOM tree too.
  const dismiss = () => {
    setSelected(null);
    setDomOpen(false);
  };

  // Esc, one level at a time:
  // - something selected: clear the selection and close the DOM tree (inside
  //   the dialog, the dialog handles Esc itself: editor → search → clear →
  //   close, which does the same);
  // - only the select tool on, nothing selected: turn the tool off.
  useEffect(() => {
    if (!selected && !selecting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) {
        if (e.composedPath().includes(host)) return;
        e.preventDefault();
        dismiss();
      } else {
        e.preventDefault();
        setTool(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selected, selecting, host]);

  // A tool's button (or its Option shortcut): on, switching from the other
  // one keeps the selection (the same element, edited or commented).
  // Clicking the one that's on doesn't turn it off (Esc does, once nothing
  // is selected): Comment's goes to the next thread that needs the
  // designer, Select's does nothing.
  const onTool = (next: Exclude<Tool, null>) => {
    if (tool !== next) setTool(next);
    else if (next === "comment") nextThread();
  };

  // Threads that need the designer (the agent spoke last), oldest first,
  // wrapping around after the last: each one opened, scrolled to (unless
  // it's in view) and flashed, as the jobs button does. Threads whose element isn't on this page are skipped.
  const lastThread = useRef<string | null>(null);
  const openThread = (element: Element) => {
    if (!isEditable(element)) return;
    onReattach?.();
    setTool("comment");
    setSelected((prev) => (prev?.element === element ? prev : { element, key: (prev?.key ?? 0) + 1 }));
  };
  const nextThread = () => {
    if (!session) return;
    const open = session.attention.flatMap((thread) => {
      const element = session.threadElement(thread);
      return element ? [{ thread, element }] : [];
    });
    if (!open.length) return;
    const next = open[(open.findIndex((t) => t.thread.id === lastThread.current) + 1) % open.length] as (typeof open)[number];
    lastThread.current = next.thread.id;
    goTo([next.element]);
    openThread(next.element);
  };
  const onToolRef = useRef(onTool);
  onToolRef.current = onTool;

  // Comments: the selected element's thread, where its latest comment
  // stands, and sending one (to the agent at once; with none, copied).
  const thread = selected && session ? session.threadFor(selected.element) : null;
  const threadJob = thread && session ? session.threadJob(thread) : null;
  // Comments written while a job was on the element wait for it (see PilotSession.comment).
  const threadWaits = !!thread?.messages.some((m) => m.waiting);
  const threadStatus = threadWaits ? "Sends when the agent is done" : threadJob ? threadJobStatus(threadJob) : undefined;
  const sendComment = async (element: Element, text: string): Promise<CommentOutcome> => {
    if (!session) return false;
    const { job, changeSet, waiting } = session.comment(element, text);
    if (job || waiting) return "sent";
    return (await copyText(formatPrompt(changeSet))) ? "copied" : false;
  };

  const hideSelection = !!inspect?.some(hidesSelection);

  // Where the selection's actions are (see SelectionActions), for the hover
  // label to keep clear of: Make responsive (unless a job is on it), Show in
  // DOM, its loader, its thread's icon.
  const selectionActions =
    selected && selectedRect && (commenting || !hideSelection)
      ? actionsBox(
          selectedRect,
          Number(!selectedJob) + 1 + Number(!!marks.get(selected.element)?.thread) + Number(!!selectedJob),
        )
      : null;
  /**
   * How wide a hovered element's label may be (see Highlight's labelRoom):
   * up to its own corner icons, and up to the selection's actions when they
   * sit along the label's row (a parent hovered while its child is selected).
   */
  const labelPlace = (element: Element, rect: DOMRect): { labelRoom?: number; labelShift?: number } => {
    // The label's row (Highlight.css): it starts at the box's left edge,
    // 4px above its top (or 4px down inside it), like the actions.
    const start = rect.left;
    let room = Infinity;
    let shift = 0;
    const own = cornerWidth(marksOn(element));
    if (own) room = rect.width - own;
    const box = element === selected?.element ? null : selectionActions;
    const top = rect.top < 24 ? rect.top + 4 : rect.top - 24;
    if (box && box.top < top + 20 && box.bottom > top && box.right > start) {
      room = Math.min(room, box.left - 4 - start);
      // On one row with them: lined up, not a pixel or two off.
      shift = box.top - top;
    }
    return { labelRoom: room === Infinity ? undefined : room, labelShift: shift || undefined };
  };

  return (
    <>
      {/* Elements a job is on (other than the selection, which shows it
          itself): their outline and their loader, until it's finished. */}
      {[...marks].map(([element, { job, thread }]) =>
        element === selected?.element ? null : (
          <CornerMarks
            key={elementKey(element)}
            element={element}
            busy={job && busyOf(job)}
            onOpenThread={thread && (() => openThread(element))}
          />
        ),
      )}
      {/* The jobs button's flash on the next job's elements. */}
      {flash?.elements.map((element) => (
        <FlashOutline key={`${flash.key}-${elementKey(element)}`} element={element} />
      ))}
      {selected && selectedRect && commenting && (
        <>
          <Highlight element={selected.element} rect={selectedRect} variant="selected" label={false} />
          <CommentWidget
            key={selected.key}
            element={selected.element}
            anchor={selectedRect}
            thread={thread}
            status={threadStatus}
            agentName={threadJob?.agent?.label ?? session?.state.agents[0]?.label}
            onSend={(text) => sendComment(selected.element, text)}
            // Resolved: the thread goes, and the widget closes (the next one is the Comment button's click away).
            onResolve={
              thread
                ? () => {
                    session?.resolve(thread.id);
                    dismiss();
                  }
                : undefined
            }
            onClose={dismiss}
            autoFocus={selected.from !== "dom"}
          />
          <SelectionActions
            rect={selectedRect}
            domOpen={domOpen}
            onShowInDom={() => setDomOpen((open) => !open)}
            responsiveMode={sendToAgent ? "send" : "copy"}
            onMakeResponsive={() => makeResponsive(selected.element)}
            busy={selectedBusy}
            // The thread is open already: its icon stays, as everywhere.
            onOpenThread={marks.get(selected.element)?.thread ? () => setTool("comment") : undefined}
          />
        </>
      )}
      {selected && selectedRect && !commenting && (
        <>
          {/* Grid containers also show their grid lines, under the selection
              highlight and the gap stripes; their numbers go on top (below).
              A grid item shows its parent's grid (orParent). */}
          {!hideSelection && <GridOverlay element={selected.element} part="lines" orParent />}
          {/* While some properties are edited (padding…) their areas replace the
              selection highlight and the grid lines and numbers, so the change
              is visible; others (the gap) are drawn along with them. See
              hidesSelection(). */}
          {!hideSelection && (
            <Highlight
              element={selected.element}
              rect={selectedRect}
              variant="selected"
              // No name and size on the selection: you know what you clicked,
              // and its corner is kept for the selection's actions.
              label={false}
            />
          )}
          {inspect && <BoxAreas element={selected.element} areas={inspect} />}
          {!hideSelection && <GridOverlay element={selected.element} part="numbers" orParent />}
          <PropertyDialog
            key={selected.key}
            element={selected.element}
            anchor={selectedRect}
            initialQuery={lastQuery.current}
            onQueryChange={(query) => {
              lastQuery.current = query;
            }}
            history={history}
            onClose={dismiss}
            onInspect={setInspect}
            widths={widths}
            onWidthsChange={setWidths}
            states={states}
            onStatesChange={setStates}
            viewportWidth={viewportWidth}
            widthPick={widthPick}
            autoFocus={selected.from !== "dom"}
          />
          {/* After the dialog (same layer: DOM order decides), so the button's
              tooltip shows over the dialog when they meet. */}
          {!hideSelection && (
            <SelectionActions
              rect={selectedRect}
              domOpen={domOpen}
              onShowInDom={() => setDomOpen((open) => !open)}
              responsiveMode={sendToAgent ? "send" : "copy"}
              onMakeResponsive={() => makeResponsive(selected.element)}
              busy={selectedBusy}
              // A thread waiting for the designer: its icon switches to Comment, which opens it.
              onOpenThread={marks.get(selected.element)?.thread ? () => setTool("comment") : undefined}
            />
          )}
        </>
      )}
      {/* The hover comes after the selection, so its label is drawn over the
          selection's outline, dots and grid lines (same layer: DOM order decides).
          The dialog and the toolbar are on a higher layer either way. */}
      {domHover && domHoverRect && domHover !== selected?.element && (
        <Highlight element={domHover} rect={domHoverRect} variant="hover" nameAttributes={nameAttributes} {...labelPlace(domHover, domHoverRect)} />
      )}
      {hovered && hoverRect && !domHover && (
        <>
          <Highlight element={hovered} rect={hoverRect} variant="hover" nameAttributes={nameAttributes} {...labelPlace(hovered, hoverRect)} />
          {/* A hovered grid shows its lines; numbers come with the selection. */}
          <GridOverlay element={hovered} part="lines" />
        </>
      )}
      {domOpen && (
        <DomTree
          selected={selected?.element ?? null}
          onHover={setDomHover}
          onSelect={pickFromDom}
          onClose={() => setDomOpen(false)}
        />
      )}
      <ViewportWidth
        width={viewportWidth}
        widths={widths}
        onPick={(width, shift) =>
          selected ? setWidthPick({ width, shift }) : setWidths((current) => clickWidth(current, width, shift))
        }
      />
      <Toolbar
        tool={tool}
        onTool={onTool}
        attention={session?.attention.length ?? 0}
        mode={sendToAgent ? "send" : "copy"}
        canSend={sendCount > 0}
        sendCount={sendCount}
        onSend={sendToAgent ? sendChanges : copyPrompt}
        pending={pending}
        onNextJob={nextJob}
        onQuit={onQuit}
        spot={toolbarSpot}
        onMove={moveToolbar}
      />
    </>
  );
}

/** A job and where it stands, in words ("Make responsive: Claude Code is working"). */
function jobText(job: JobRecord): string {
  return `${whatText(job)}: ${statusText(job)}`;
}

/** Where a thread's latest comment stands, while it's with the agent. */
function threadJobStatus(job: JobRecord): string | undefined {
  if (job.status === "queued") return "Waiting for an agent";
  if (job.status === "working") return `${job.agent?.label ?? "The agent"} is working on it`;
  return undefined;
}

/** The tool an Option+key shortcut turns on: C for Comment, V for Select (`code`, as Option changes the character). */
export function toolShortcut(code: string): Exclude<Tool, null> | null {
  return code === "KeyC" ? "comment" : code === "KeyV" ? "select" : null;
}

/**
 * What an element that isn't selected shows: its outline, and on its
 * top-right corner a job's loader (hover for an X that cancels it) and the
 * comment icon of an unresolved thread (which opens it).
 */
function CornerMarks({ element, busy, onOpenThread }: { element: Element; busy?: Busy; onOpenThread?(): void }) {
  const rect = useElementRect(element);
  if (!rect) return null;
  return (
    <>
      <Highlight element={element} rect={rect} variant="busy" label={false} />
      <SelectionActions rect={rect} busy={busy} onOpenThread={onOpenThread} />
    </>
  );
}

/** The width of `count` corner icons (20px, 4px apart), and the 4px before them; 0 for none. */
function cornerWidth(count: number): number {
  return count ? count * 20 + (count - 1) * 4 + 4 : 0;
}

/** How long the jobs button's flash lasts, in ms (Highlight.css, `flash`). */
const FLASH_MS = 900;

/** The jobs button's flash on an element (Highlight's `flash` variant). */
function FlashOutline({ element }: { element: Element }) {
  const rect = useElementRect(element);
  return rect ? <Highlight element={element} rect={rect} variant="flash" label={false} /> : null;
}

/**
 * Scrolls `element` to the middle of the window (smoothly, unless the
 * designer asked for reduced motion), unless all of it is in view already.
 * Resolves once the scroll is over (`scrollend`, or 700ms at most).
 */
function scrollTo(element: Element): Promise<void> {
  const rect = element.getBoundingClientRect();
  if (rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth) return Promise.resolve();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
  if (reduced) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("scrollend", done, true);
      resolve();
    };
    const timer = setTimeout(done, 700);
    window.addEventListener("scrollend", done, true);
  });
}

/** A key per element, for lists of them (the same element keeps its key). */
const keys = new WeakMap<Element, number>();
let nextKey = 0;
function elementKey(element: Element): number {
  let key = keys.get(element);
  if (key === undefined) keys.set(element, (key = nextKey++));
  return key;
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}
