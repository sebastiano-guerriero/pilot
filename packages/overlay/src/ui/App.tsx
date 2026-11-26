import type { CommentAction, CommentReference, ElementState, ElementTarget, PropChange, WidthRange } from "@pilot/protocol";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import { type BoxArea, hidesSelection } from "../dom/boxModel.ts";
import { measuredBoxes } from "../dom/measure.ts";
import { revealInWindow } from "../dom/reveal.ts";
import { componentName, componentProps } from "../dom/component.ts";
import { mentionables } from "../dom/mentions.ts";
import { setFileTokens } from "../dom/tokens.ts";
import { findSimilar } from "../dom/similar.ts";
import { describeElement, type EditableElement, findTarget, isEditable } from "../dom/target.ts";
import { isTextOnly, normalizeText, textProperty, textRunAt } from "../dom/text.ts";
import { type EditHistory, historyShortcut } from "../edits/history.ts";
import { type WidthChip, clickWidth } from "../edits/widths.ts";
import type { PilotDevOptions } from "../mount.tsx";
import { caretAt, editText } from "../select/inlineText.ts";
import { useElementPicker } from "../select/useElementPicker.ts";
import { useAltHeld } from "../select/useAltHeld.ts";
import { clearsView } from "../editors/listOrder.ts";
import { useElementRect } from "../select/useElementRect.ts";
import { Measurements } from "./components/Measurements/Measurements.tsx";
import { BoxAreas } from "./components/BoxAreas/BoxAreas.tsx";
import { GridOverlay } from "./components/GridOverlay/GridOverlay.tsx";
import { Highlight } from "./components/Highlight/Highlight.tsx";
import { PropertyDialog, type Reach, type WidthPick } from "./components/PropertyDialog/PropertyDialog.tsx";
import { awaitsAnswer, type CommentThread, type JobRecord, needsYou, type PilotSession } from "../bridge/session.ts";
import { elapsed, jobAbout, statusText, whatText } from "./components/JobList/JobList.tsx";
import { DomTree } from "./components/DomTree/DomTree.tsx";
import { actionsBox, type Busy, SelectionActions } from "./components/SelectionActions/SelectionActions.tsx";
import { type CommentOutcome, CommentWidget } from "./components/CommentWidget/CommentWidget.tsx";
import { type MentionOption, mentionOptions } from "./components/CommentWidget/mentions.ts";
import { Confetti } from "./components/Confetti/Confetti.tsx";
import { thumbnail } from "../dom/thumbnail.ts";
import { type Tool, Toolbar } from "./components/Toolbar/Toolbar.tsx";
import { ViewportWidth } from "./components/ViewportWidth/ViewportWidth.tsx";
import { countChanges } from "./changesLabel.ts";
import { draftFor, keepDraft } from "./drafts.ts";
import { loadSelection, saveSelection } from "./selectionKeep.ts";
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
  /** The handoff to agents (Send, jobs). None: nothing can be sent. */
  session?: PilotSession;
  /** Find again the elements of changes that aren't on the page (see EditHistory.reattach). */
  onReattach?(): void;
  onQuit(): void;
  /**
   * Out of sight in this tab (mountPilot's setHidden): everything stays as it
   * is, but nothing picks, measures or takes keys from the page meanwhile, so
   * its hover, focus and clicks are the page's own.
   */
  hidden?: boolean;
  /** Hide it (the toolbar's button), as the shortcut does. */
  onHide?(): void;
  /** The shortcut that hides it and brings it back (`alt+p`), for the button's tooltip. */
  hideShortcut?: string;
}

/**
 * Pilot while running.
 * - Cursor on: Pilot owns page clicks. Hover shows an outline, a click selects,
 *   and the property dialog opens next to the selected element. Clicking
 *   another element re-selects; Esc clears the selection.
 * - Cursor off: the page behaves normally again and the selection is cleared.
 */
/** Finding the selection again after the page re-rendered it: how often, and how many times (a reload: longer, the page loads first). */
const REFIND_EVERY = 150;
const REFIND_TRIES = 8;
const RESTORE_TRIES = 20;

export function App({ host, dev, nameAttributes, history, session, onReattach, onQuit, hidden = false, onHide, hideShortcut }: AppProps) {
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
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

  // The other selected elements, when several are (Shift+click with Select,
  // or the DOM tree: Cmd/Ctrl adds one, Shift a range). `selected` stays the
  // first: the dialog opens beside it and its changes go to all of them.
  const [others, setOthers] = useState<EditableElement[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // How each selected element was, to find it again when it leaves the page (see findTarget).
  const targets = useRef(new Map<Element, ElementTarget>());
  const othersRef = useRef(others);
  othersRef.current = others;
  // The element added to the selection last: the panel (dialog or comment box) sits beside it (`placeBy`).
  const [latest, setLatest] = useState<EditableElement | null>(null);
  /** Select `element` alone (a plain click, a thread, a row). */
  const selectOnly = (element: EditableElement, from?: "dom") => {
    setSelected((prev) => (prev?.element === element ? prev : { element, key: (prev?.key ?? 0) + 1, ...(from ? { from } : {}) }));
    setOthers([]);
  };
  /** Add `element` to the selection, or take it out (the first one too: the next becomes the first). */
  const toggleSelected = (element: EditableElement, from?: "dom") => {
    const primary = selectedRef.current?.element;
    if (!primary) return selectOnly(element, from);
    if (element === primary) {
      const [next, ...rest] = othersRef.current;
      if (!next) return; // The last one stays: Esc clears it.
      setSelected((prev) => ({ element: next, key: (prev?.key ?? 0) + 1, ...(from ? { from } : {}) }));
      setOthers(rest);
      return;
    }
    if (!othersRef.current.includes(element)) setLatest(element);
    setOthers((list) => (list.includes(element) ? list.filter((e) => e !== element) : [...list, element]));
  };

  // The search carries over from one selection to the next: set col-span on
  // one card, click the next, and the same editor is already there. It starts
  // empty again once nothing is selected (Esc, the cursor off, the dialog closed).
  const lastQuery = useRef(dev?.query ?? "");
  useEffect(() => {
    if (!selected) lastQuery.current = "";
  }, [selected]);

  // The width chip: the viewport widths changes are for (null: the rule that applies at the window's width).
  // Set in the search (`from-1200 `) or by clicking the viewport width; it
  // stays, across selections and with nothing selected, until it's removed.
  const [widths, setWidthChip] = useState<WidthChip | null>(null);
  // Where the property in use has values among the widths (PropertyDialog's onReach), for the ruler.
  const [reach, setReach] = useState<Reach | null>(null);
  // The state pills: the element states changes are for, together. Kept across selections, like the chip.
  const [states, setStateList] = useState<ElementState[]>([]);
  // The `default` pill on instead of the modifiers' (PropertySearch): no width chip and no states meanwhile,
  // both kept to switch back; back to them when either changes.
  const [defaultState, setDefaultState] = useState(false);
  const setStates = useCallback((next: ElementState[]) => {
    setStateList(next);
    setDefaultState(false);
  }, []);
  const setWidths = useCallback((next: WidthChip | null | ((current: WidthChip | null) => WidthChip | null)) => {
    setWidthChip(next);
    setDefaultState(false);
  }, []);
  const viewportWidth = useViewportWidth();
  // A click on the viewport width. With the dialog open, it goes to the
  // dialog, which sets the chip (a `from`/`to` typed in the search decides it).
  const [widthPick, setWidthPick] = useState<WidthPick | undefined>();

  const onPick = useCallback((element: EditableElement, how?: { shift: boolean }) => {
    onReattach?.(); // the page may have re-rendered since: changes find their elements again
    // Shift+click adds to the selection (or takes out), with either tool: a comment can be about several elements.
    if (how?.shift && toolRef.current) toggleSelected(element);
    else selectOnly(element);
  }, []);

  // The DOM tree: the page's elements as a tree, to select any of them
  // (Alt+D, or the selection's Show in DOM action). Hovering a row highlights its
  // element; picking one selects it, scrolled into view.
  const [domOpen, setDomOpen] = useState(false);
  const [domHover, setDomHover] = useState<Element | null>(null);
  // In the DOM tree: Cmd/Ctrl+click adds a row's element (or takes it out), Shift+click selects a range of rows.
  const pickFromDom = useCallback((element: Element, how?: { add?: boolean; range?: readonly Element[] }) => {
    if (!isEditable(element)) return;
    onReattach?.();
    // The window only, never the page's own containers: they'd move its elements (dom/reveal.ts).
    void revealInWindow(element);
    const several = !!toolRef.current;
    if (several && how?.range?.length) {
      const range = how.range.filter(isEditable);
      const current = selectedRef.current?.element;
      const first = current && range.includes(current) ? current : (range[0] as EditableElement);
      setSelected((prev) => (prev?.element === first ? prev : { element: first, key: (prev?.key ?? 0) + 1, from: "dom" }));
      setOthers(range.filter((e) => e !== first));
      setLatest(element);
    } else if (several && how?.add) toggleSelected(element, "dom");
    else selectOnly(element, "dom");
  }, []);
  useEffect(() => {
    if (!domOpen) setDomHover(null);
  }, [domOpen]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.code !== "KeyD" || hiddenRef.current) return;
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
  // Option+P and Alt+D, so plain keys stay the page's. In Pilot's own fields
  // too, the comment box included: a tool's field always has the focus, so
  // the shortcut wins over the character it would type there (ç, √); not in
  // the page's own fields.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || hiddenRef.current) return;
      const next = toolShortcut(e.code);
      if (!next) return;
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
  // The dialog's editor whose change is being looked at (PropertyDialog's onEditing), for clearsView().
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => setInspect(null), [selected?.key]);

  const [, refresh] = useReducer((n: number) => n + 1, 0);
  // How many changes there are: what shows (the comment box's chip, Send's pill) follows the history.
  const [, setChangeCount] = useState(() => history.changes().length);
  useEffect(() => history.subscribe(() => setChangeCount(history.changes().length)), [history]);
  // The session's jobs and agents: re-render as they change.
  const [, setSessionTick] = useState(0);
  // Confetti bursts in flight (Mark as solved), each gone once it's over.
  const [bursts, setBursts] = useState<{ key: number; from: DOMRect }[]>([]);
  const burstKey = useRef(0);
  useEffect(() => session?.subscribe(() => setSessionTick((n) => n + 1)), [session]);
  useEffect(() => history.subscribe(() => setSessionTick((n) => n + 1)), [history]);
  // Pilot runs for this site (`npx usepilot`): Send and comments go to the agent. Without it, both
  // say so (the toolbar's red pills, PilotSession.stuck): there's no other way to hand changes over.
  const sendToAgent = !!session?.canSendToAgent;
  // What Send would send: the changes not sent yet, less those waiting for a job on their element.
  const sendCount = (session?.unsent ?? 0) - (session?.heldCount ?? 0);
  // Send: what went, and what waits for a job still on its element (it goes once that's finished).
  const sendChanges = (): boolean | string => {
    if (!session) return false;
    const job = session.send();
    const held = session.heldCount > 0;
    if (job) return held ? "Sent; some queued" : true;
    return held ? "Queued" : false;
  };
  // The job on the selected element, if one isn't finished: its actions give way to where it stands.
  // A job waiting for the designer's answer shows no loader: its question, in the thread, says so (see PilotSession.ask).
  const jobShown = (job: JobRecord | null) => (job && !awaitsAnswer(job) ? job : null);
  const selectedJob = selected && session ? jobShown(session.jobOn(selected.element)) : null;
  // Jobs nothing will move by themselves (see PilotSession.stuck): said on their elements, the toolbar and the thread.
  const stuck = session?.stuck ?? null;
  const isStuck = (job: JobRecord | null | undefined) => !!job && !!stuck?.jobs.includes(job.id);
  const stuckAlert = stuck ? { title: stuck.title, detail: stuck.detail } : undefined;
  /** Whether a job is on an element and moving: its fill breathes (not while it's stuck). */
  const workingOn = (element: Element) => {
    const job = session?.jobOn(element);
    return !!job && !isStuck(job);
  };
  const busyOf = (job: JobRecord): Busy => ({
    text: jobText(job),
    about: jobAbout(job),
    // The agent by its app's name, as in the comment box ("Claude Code is working on it").
    status: job.status === "working" ? `${agentName(job.agent?.label) ?? "The agent"} is working on it${elapsed(job.takenAt)}` : statusText(job),
    onCancel: session?.canCancel(job) ? () => session.cancel(job.id) : undefined,
    ...(isStuck(job) ? { stuck: stuckAlert } : {}),
  });
  const selectedBusy = selectedJob ? busyOf(selectedJob) : undefined;
  // What shows on elements' top-right corners, selected or not: a job's
  // loader, and the comment icon of an unresolved thread (unless its
  // comment is with the agent: its loader says so then). Both come with the
  // element's outline.
  const marks = new Map<Element, { job?: JobRecord; thread?: CommentThread }>();
  for (const { element, job } of session?.busy ?? []) if (jobShown(job)) marks.set(element, { job });
  for (const thread of session?.threads ?? []) {
    const job = session?.threadJob(thread);
    if (job && job.status !== "cancelled" && !job.checked && !needsYou(thread)) continue; // with the agent
    const element = session?.threadElement(thread);
    if (element) marks.set(element, { ...marks.get(element), thread });
  }
  // The selected element's thread, whatever stands: on the page, a thread
  // with the agent shows only its loader (the comment icon is for a reply to
  // read); selected, its icon is the selection's own action, beside the
  // loader, to open it and see what the job is about.
  const selectedThread = selected && session ? session.threadFor(selected.element) : null;
  /** How many icons sit on `element`'s corner (the hover label stops before them). */
  const marksOn = (element: Element) => {
    const mark = marks.get(element);
    return Number(!!mark?.job) + Number(!!mark?.thread);
  };
  // Jobs not finished yet: waiting, an agent applying, checking the page. Not one whose question waits for the
  // designer (awaitsAnswer): nothing runs until they answer, then it's running again.
  const pending = (session?.jobs ?? []).filter(
    (j) => !awaitsAnswer(j) && (j.status === "queued" || j.status === "working" || (j.status === "done" && !j.checked && !j.error)),
  ).length;
  // The toolbar's alerts. Pilot not running for the site (or an older one in the way): on Comment and Send both, jobs
  // or not (whatever goes next can't go), so cancelling the stuck jobs doesn't hide it. A run that failed or went
  // quiet: on Comment for stuck jobs asked in a thread (comments, tasks from the comment box), on Send for the rest.
  const inThread = (id: string) => !!session?.threads.some((t) => t.messages.some((m) => m.jobId === id));
  const toolbarAlerts = !stuck
    ? undefined
    : stuck.kind !== "agent-error" && stuck.kind !== "quiet"
      ? { comment: stuckAlert, send: stuckAlert }
      : {
          ...(stuck.jobs.some(inThread) ? { comment: stuckAlert } : {}),
          ...(stuck.jobs.some((id) => !inThread(id)) ? { send: stuckAlert } : {}),
        };
  // Every job stuck: none is being worked on, so the jobs button (its robot at work) goes.
  const running = stuck && stuck.jobs.length >= pending ? 0 : pending;
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
    void revealInWindow(elements[0] as Element, "center", true).then(() => {
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

  // Inline text editing: a double-click on a text (Select tool) makes it
  // editable in place (select/inlineText.ts): a text-only element's whole
  // text, or the run of text under the pointer in an element with child
  // elements. What's typed is a text change in the history, one undo step per edit.
  const [editing, setEditing] = useState<{ element: HTMLElement; host: HTMLElement; finish: (commit: boolean) => void } | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const onDoubleClick = useCallback(
    (element: EditableElement, at: { x: number; y: number }) => {
      if (toolRef.current !== "select" || !(element instanceof HTMLElement)) return;
      const run = isTextOnly(element) ? null : textRunAt(element, caretAt(at.x, at.y)?.node ?? null);
      if (!isTextOnly(element) && !run) return;
      editingRef.current?.finish(true);
      // The double-click's first click selected it already; `from: "dom"` keeps a new dialog from taking focus.
      // Text is edited on one element: the others leave the selection.
      selectOnly(element, "dom");
      const edit = editText(
        element,
        at,
        (text) => {
          setEditing((current) => (current?.element === element ? null : current));
          if (text !== null) commitText(history, element, text, run?.run ?? 0);
        },
        run?.nodes,
      );
      setEditing({ element, ...edit });
    },
    [history],
  );
  // The edit ends (done) when the selection moves to another element or the tool changes.
  useEffect(() => {
    if (editing && (selected?.element !== editing.element || tool !== "select")) editing.finish(true);
  }, [editing, selected?.element, tool]);
  useEffect(() => () => editingRef.current?.finish(true), []);

  const hovered = useElementPicker(selecting && !hidden, host, onPick, { editing: editing?.host ?? null, onDoubleClick });
  const hoverRect = useElementRect(hovered !== selected?.element ? hovered : null);
  // While the selected element is being found again (it left the page, see
  // below), its last box: the panel stays mounted, with what's in it.
  const measuredRect = useElementRect(selected?.element ?? null);
  const lastRect = useRef<{ key: number; rect: DOMRect } | null>(null);
  if (selected && measuredRect) lastRect.current = { key: selected.key, rect: measuredRect };
  const selectedRect =
    measuredRect ?? (selected && !selected.element.isConnected && lastRect.current?.key === selected.key ? lastRect.current.rect : null);
  // Alt held with an element selected (a tool on): Figma's redlines, the distances from the selection to the
  // element under the pointer, or to its parent when that's the selection itself (or nothing). The green
  // selection (outline, dots, actions, grid lines) and the hover highlight give way to them meanwhile.
  const alt = useAltHeld();
  const measuring = alt && !!selected && !!tool && !hidden;
  const measureTo = !measuring ? null : hovered && hovered !== selected?.element ? hovered : (selected?.element.parentElement ?? null);
  const measureRect = useElementRect(measureTo);
  const domHoverRect = useElementRect(domHover);

  // The selected element left the page (the agent's edit re-rendered it,
  // hot reload remounted it): the same element is found again, as the
  // page has it now (findTarget), and stays selected, with its panel and
  // what's being written in it (same key). A few tries, as the framework
  // may put it back a moment later; not found, the selection goes.
  useEffect(() => {
    if (!selected || selected.element.isConnected) return;
    const target = targets.current.get(selected.element);
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      const found = target ? findTarget(target) : null;
      if (isEditable(found)) return setSelected((prev) => (prev?.key === selected.key ? { ...prev, element: found } : prev));
      if (++tries < REFIND_TRIES) timer = setTimeout(look, REFIND_EVERY);
      else setSelected((prev) => (prev?.key === selected.key ? null : prev));
    };
    look();
    return () => clearTimeout(timer);
  }, [selected, measuredRect]);

  // Esc that drops the selection (the dialog hides) closes the DOM tree too.
  const dismiss = () => {
    setSelected(null);
    setOthers([]);
    setDomOpen(false);
  };
  // The others too: found again, else they leave the selection.
  useEffect(() => {
    if (!others.some((e) => !e.isConnected)) return;
    setOthers((list) =>
      list.flatMap((e) => {
        if (e.isConnected) return [e];
        const target = targets.current.get(e);
        const found = target ? findTarget(target) : null;
        return isEditable(found) ? [found] : [];
      }),
    );
  }, [others, measuredRect]);

  // Kept through a full reload the agent causes (see selectionKeep.ts):
  // the tool, the selected elements, the comment being written; restored
  // once they're on the page again (frameworks render a moment after load).
  // Nothing is saved until the restore is done, so it isn't overwritten.
  // The project's tokens that only live in files (Pilot's server reads them):
  // asked for whenever the selection changes (the server reads only what
  // changed since), so a token added to a file shows the next time.
  useEffect(() => {
    if (!session || !sendToAgent) return;
    let current = true;
    void session.projectTokens().then((tokens) => current && setFileTokens(tokens));
    return () => {
      current = false;
    };
  }, [selected?.key, sendToAgent]);

  // What's being written comes back with the element (drafts.ts), looked up once per selection.
  const selectedDraft = useMemo(() => (selected ? draftFor(selected.element) : undefined), [selected?.key]);
  const restoring = useRef(!dev);
  useEffect(() => {
    const kept = restoring.current ? loadSelection() : null;
    if (!kept) {
      restoring.current = false;
      return;
    }
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      const [first, ...rest] = kept.targets.map((t) => findTarget(t));
      if (isEditable(first)) {
        setTool(kept.tool);
        setSelected({ element: first, key: 1 });
        setOthers(rest.filter(isEditable));
        restoring.current = false;
        return;
      }
      if (++tries < RESTORE_TRIES) timer = setTimeout(look, REFIND_EVERY);
      else restoring.current = false;
    };
    look();
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (restoring.current) return;
    const elements = selected ? [selected.element, ...others] : [];
    for (const e of elements) if (e.isConnected && !targets.current.has(e)) targets.current.set(e, describeElement(e));
    for (const e of targets.current.keys()) if (!elements.includes(e as EditableElement)) targets.current.delete(e);
    saveSelection(
      tool && selected
        ? {
            tool,
            targets: elements.flatMap((e) => targets.current.get(e) ?? []),
          }
        : null,
    );
  }, [tool, selected, others]);

  // Esc, one level at a time:
  // - something selected: clear the selection and close the DOM tree (inside
  //   the dialog, the dialog handles Esc itself: editor → search → clear →
  //   close, which does the same);
  // - only the select tool on, nothing selected: turn the tool off.
  useEffect(() => {
    if (!selected && !selecting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || hiddenRef.current) return;
      if (editingRef.current) return; // cancels the inline text edit (select/inlineText.ts)
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
  // A thread about several elements selects them all again (see CommentThread.others).
  const openThread = (element: Element) => {
    if (!isEditable(element)) return;
    onReattach?.();
    setTool("comment");
    selectOnly(element);
    const thread = session?.threadFor(element);
    if (thread) setOthers(session?.threadOthers(thread).filter(isEditable).filter((e) => e !== element) ?? []);
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
  // stands, and sending one (to the agent at once; without Pilot running, the box says so).
  const thread = selected && session ? session.threadFor(selected.element) : null;
  const threadJob = thread && session ? session.threadJob(thread) : null;
  // Comments written while a job was on the element wait for it (see PilotSession.comment).
  const threadWaits = !!thread?.messages.some((m) => m.waiting);
  const threadStatus = threadWaits ? "Queued" : threadJob && !awaitsAnswer(threadJob) && !(thread && needsYou(thread)) ? threadJobStatus(threadJob) : undefined;
  // Comments go to an agent only: without one on the page, the widget's send is disabled.
  // Attached files go to the hub first (it saves them for the agent); nothing is sent if one fails.
  // An action picked from the `/` menu (Make responsive) goes as that task, the words as its note;
  // a skill picked there goes with the comment, for the agent to use.
  // What `@` mentioned goes as exact references: a token with its value, a
  // component or an element described as the page shows it now.
  // The selected elements' edits not sent yet go with the comment, unless the designer took its chip off (`withEdits`).
  const sendComment = async (
    element: Element,
    text: string,
    files: File[],
    action?: CommentAction,
    mentions: MentionOption[] = [],
    withEdits = false,
    props: PropChange[] = [],
    skill?: string,
  ): Promise<CommentOutcome> => {
    if (!session || !sendToAgent) return false;
    const attachments = files.length ? await session.uploadFiles(files, thumbnail) : [];
    if (!attachments) return { title: "The file couldn't be attached", detail: "Try again, or send it without the file" };
    // Props picked from the agent's `/props` list: set on this instance, where it's written.
    const instance = props.length ? componentProps(element) : null;
    const setting = instance ? { component: instance.component, ...(instance.usedIn ? { usedIn: instance.usedIn } : {}), set: props } : undefined;
    session.comment(element, text, attachments, action, othersRef.current, mentions.flatMap(toReference), withEdits, setting, skill);
    return "sent";
  };
  // How many of them there are, for the chip (the history's changes re-render this).
  const unsentOnSelection = countChanges(
    selected ? history.changes({ unsent: true }).filter((c) => c.element === selected.element || others.includes(c.element)) : [],
  );

  // Changing how the element looks (an Appearance property: dragging its
  // wheel, or a value changed a moment ago): every highlight goes, so the
  // element shows clear (clearsView()). Measuring hides them too.
  const clearView = !commenting && !!editingId && clearsView(editingId);
  const bare = measuring || clearView;
  // What the property dialog shows of the box (padding, gap…): with Select only (it doesn't clear it when it closes).
  const inspected = commenting ? null : inspect;
  const hideSelection = !!inspected?.some(hidesSelection) || bare;
  // Beside the latest one added, while it's still selected (taken out: back to the first).
  const placeBy = latest && others.includes(latest) ? latest : undefined;

  // Select similar: the elements like the selected one (the same part of
  // each copy of what repeats, dom/similar.ts), added to the selection on
  // click. Offered while some of them aren't selected; looked for again as
  // the selection changes.
  const similarTo = useMemo(() => (selected ? findSimilar(selected.element) : []), [selected?.element]);
  const unselected = similarTo.filter((e) => !others.includes(e) && e.isConnected);
  const similar = unselected.length
    ? {
        count: unselected.length,
        // The panel moves beside the last one added, as for a Shift+click.
        onSelect: () => {
          setOthers((list) => [...list, ...unselected.filter((e) => !list.includes(e))]);
          setLatest(unselected.at(-1) ?? null);
        },
      }
    : undefined;

  // Where the selection's actions are (see SelectionActions), for the hover
  // label to keep clear of: Show in DOM, its loader, its thread's icon.
  const selectionActions =
    selected && selectedRect && (commenting || !hideSelection)
      ? actionsBox(
          selectedRect,
          Number(!!similar) + Number(!others.length) + Number(!!selectedThread) + Number(!!selectedJob),
          true,
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
    // Its own corner icons: the label stops short of them; flipped to the left (near the window's
    // left edge, see actionsBox), they're where the label starts, so it goes below (no room).
    const icons = marksOn(element);
    const own = cornerWidth(icons);
    if (own) room = actionsBox(rect, icons).flipped ? 0 : rect.width - own;
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
      {bursts.map((burst) => (
        <Confetti key={burst.key} from={burst.from} onDone={() => setBursts((all) => all.filter((b) => b !== burst))} />
      ))}
      {/* The jobs button's flash on the next job's elements. */}
      {flash?.elements.map((element) => (
        <FlashOutline key={`${flash.key}-${elementKey(element)}`} element={element} />
      ))}
      {/* The selection, drawn the same with either tool (grid lines and numbers, outline,
          the other selected elements, the actions), then the tool's panel. */}
      {selected && selectedRect && (
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
              working={!!selectedJob && !isStuck(selectedJob)}
            />
          )}
          {inspected && <BoxAreas element={selected.element} areas={inspected} />}
          {!hideSelection && <GridOverlay element={selected.element} part="numbers" orParent />}
          {/* The other selected elements: the selection's outline, and dots. */}
          {!bare &&
            others.map((element) => <SelectedOutline key={elementKey(element)} element={element} working={workingOn(element)} />)}
          {/* Before the dialog (same layer: DOM order decides), so the dialog
              covers them when it's over the element's corner. */}
          {!hideSelection && (
            <SelectionActions
              rect={selectedRect}
              selected
              domOpen={domOpen}
              similar={similar}
              // Several selected: no Show in DOM (it would point at the first one only); the tree marks them all.
              onShowInDom={others.length ? undefined : () => setDomOpen((open) => !open)}
              busy={selectedBusy}
              // A thread waiting for the designer: its icon switches to Comment, which opens it.
              onOpenThread={selectedThread ? () => setTool("comment") : undefined}
            />
          )}
          {commenting ? (
            <CommentWidget
              key={selected.key}
              element={selected.element}
              initialText={selectedDraft}
              onTextChange={(text) => keepDraft(selected.element, text)}
              anchor={selectedRect}
              placeBy={placeBy}
              veiled={measuring}
              thread={thread}
              status={threadStatus}
              error={threadJob && isStuck(threadJob) ? stuckAlert : undefined}
              onStop={threadJob && session?.canCancel(threadJob) ? () => session.cancel(threadJob.id) : undefined}
              agentName={agentName(threadJob?.agent?.label ?? session?.state.agents[0]?.label)}
              agentOn={sendToAgent}
              onSend={(text, files, action, mentions, withEdits, props, skill) => sendComment(selected.element, text, files, action, mentions, withEdits, props, skill)}
              edits={unsentOnSelection}
              // `/props` for one component instance, alone (a list for several would mix their props).
              component={others.length ? undefined : (componentName(selected.element) ?? undefined)}
              currentProps={() => componentProps(selected.element)?.props ?? {}}
              mentions={() => mentionOptions(mentionables(nameAttributes))}
              projectComponents={session ? () => session.projectComponents() : undefined}
              skills={session ? () => session.projectSkills() : undefined}
              // Resolved: the thread goes, and the widget closes (the next one is the Comment button's click away).
              onResolve={
                thread
                  ? (from) => {
                      session?.resolve(thread.id);
                      dismiss();
                      // A little celebration, from Mark as solved (the widget is gone, so App draws it).
                      if (from) setBursts((all) => [...all, { key: ++burstKey.current, from }]);
                    }
                  : undefined
              }
              // Adjust by hand: Select keeps the selection (the thread's elements), so the dialog opens on them.
              onAdjust={() => setTool("select")}
              onClose={dismiss}
              autoFocus={selected.from !== "dom"}
            />
          ) : (
            <PropertyDialog
              key={selected.key}
              element={selected.element}
              others={others}
              anchor={selectedRect}
              placeBy={placeBy}
              veiled={measuring}
              initialQuery={lastQuery.current}
              onQueryChange={(query) => {
                lastQuery.current = query;
              }}
              history={history}
              onClose={dismiss}
              onInspect={setInspect}
              onEditing={setEditingId}
              onReach={setReach}
              widths={widths}
              onWidthsChange={setWidths}
              states={states}
              onStatesChange={setStates}
              defaultState={defaultState}
              onDefaultStateChange={setDefaultState}
              viewportWidth={viewportWidth}
              widthPick={widthPick}
              autoFocus={selected.from !== "dom"}
            />
          )}
        </>
      )}
      {/* The hover comes after the selection, so its label is drawn over the
          selection's outline and grid lines (same layer: DOM order decides).
          The dialog and the toolbar are on a higher layer either way. */}
      {/* The redlines (Alt held), in place of the green selection and the hover. */}
      {measuring && selected && selectedRect && measureTo && measureRect && (
        <Measurements {...measuredBoxes(selected.element, selectedRect, measureTo, measureRect)} />
      )}
      {!bare && domHover && domHoverRect && domHover !== selected?.element && (
        <Highlight element={domHover} rect={domHoverRect} variant="hover" nameAttributes={nameAttributes} {...labelPlace(domHover, domHoverRect)} />
      )}
      {!bare && hovered && hoverRect && !domHover && (
        <>
          {/* A hovered element shows its padding and a grid or flex container its gaps (striped), and its
              margin (lines): there's space to set, before it's even selected. Selected, they go, until
              their field is in use. */}
          <BoxAreas element={hovered} areas={HOVER_AREAS} />
          <Highlight element={hovered} rect={hoverRect} variant="hover" nameAttributes={nameAttributes} {...labelPlace(hovered, hoverRect)} />
          {/* A hovered grid shows its lines; numbers come with the selection. */}
          <GridOverlay element={hovered} part="lines" />
        </>
      )}
      {/* The selection's corner dots, after the hover: on top of a hovered parent's lines. Measuring (Alt), none, with either tool. */}
      {selected && selectedRect && !measuring && (commenting || !hideSelection) && (
        <Highlight element={selected.element} rect={selectedRect} variant="dots" label={false} />
      )}
      {!bare && others.map((element) => <SelectedDots key={elementKey(element)} element={element} />)}
      {domOpen && (
        <DomTree
          selected={selected?.element ?? null}
          also={others}
          onHover={setDomHover}
          onSelect={pickFromDom}
          onClose={() => setDomOpen(false)}
          veiled={measuring}
        />
      )}
      <ViewportWidth
        width={viewportWidth}
        widths={defaultState ? null : widths}
        reach={selected ? reach : null}
        onPick={(width, shift) =>
          selected ? setWidthPick({ width, shift }) : setWidths((current) => clickWidth(current, width, shift))
        }
      />
      <Toolbar
        tool={tool}
        onTool={onTool}
        attention={session?.attention.length ?? 0}
        canSend={sendCount > 0}
        sendCount={sendCount}
        onSend={sendChanges}
        discardCount={session?.unsent ?? history.changes({ unsent: true }).length}
        onDiscard={() => (session ? session.discard() : history.discard())}
        pending={running}
        alerts={toolbarAlerts}
        onNextJob={nextJob}
        onQuit={onQuit}
        onHide={onHide}
        hideShortcut={hideShortcut}
        spot={toolbarSpot}
        onMove={moveToolbar}
      />
    </>
  );
}

/**
 * An inline text edit is done: its text is a change in the history for
 * the element's text run `run` (0 for a text-only element), the page's own
 * text as its `from`. The page's own text again (whitespace
 * aside) drops Pilot's; an emptied element is left as it was (removing an
 * element's text isn't a text change).
 */
export function commitText(history: EditHistory, element: HTMLElement, typed: string, run = 0): void {
  const page = history.pageText(element, run);
  if (!normalizeText(typed)) return;
  // A space typed at the end of a line comes as a no-break space; the page's own are kept.
  const text = page.includes("\u00a0") ? typed : typed.replace(/\u00a0/g, " ");
  const value = normalizeText(text) === normalizeText(page) ? "" : text;
  history.apply(element, textProperty(run), value, undefined, { from: page });
}

/** A job and where it stands, in words ("Make responsive: Claude Code is working"). */
function jobText(job: JobRecord): string {
  return `${whatText(job)}: ${statusText(job)}`;
}

/** The agent's name from its label ("Claude Code · app" → "Claude Code"). */
export function agentName(label: string | undefined): string | undefined {
  return label?.split(" · ")[0] || undefined;
}

/** Where a thread's latest comment stands, while it's with the agent. */
function threadJobStatus(job: JobRecord): string | undefined {
  if (job.status === "queued") return "Queued";
  if (job.status === "working") return `${agentName(job.agent?.label) ?? "The agent"} is working on it`;
  // A task (Make responsive, Break and fix) is done, and Pilot checks it before taking it.
  const kind = job.changeSet.request?.kind;
  if (job.status === "done" && !job.checked && (kind === "responsive" || kind === "break-and-fix")) return "Checking every width";
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
      <Highlight element={element} rect={rect} variant="busy" label={false} working={!!busy && !busy.stuck} />
      <SelectionActions rect={rect} busy={busy} onOpenThread={onOpenThread} />
    </>
  );
}

/** The width of `count` corner icons (20px, 4px apart), and the 4px before them; 0 for none. */
function cornerWidth(count: number): number {
  return count ? count * 20 + (count - 1) * 4 + 4 : 0;
}

/**
 * What a hovered element shows (BoxAreas): its padding and, for a grid or flex container, its gaps
 * striped, its margin as lines. Selected, they go, until their field is in use.
 */
const SIDES = ["top", "right", "bottom", "left"] as const;
const HOVER_AREAS: BoxArea[] = [
  ...SIDES.map((side) => ({ box: "margin" as const, side })),
  ...SIDES.map((side) => ({ box: "padding" as const, side })),
  { box: "gap" },
];

/** How long the jobs button's flash lasts, in ms (Highlight.css, `flash`). */
const FLASH_MS = 900;

/** Another selected element (several selected): the selection's outline, no label, no actions. */
function SelectedOutline({ element, working }: { element: Element; working: boolean }) {
  const rect = useElementRect(element);
  return rect ? <Highlight element={element} rect={rect} variant="selected" label={false} working={working} /> : null;
}

/** Another selected element's corner dots (see Highlight's `dots`). */
function SelectedDots({ element }: { element: Element }) {
  const rect = useElementRect(element);
  return rect ? <Highlight element={element} rect={rect} variant="dots" label={false} /> : null;
}

/** The jobs button's flash on an element (Highlight's `flash` variant). */
function FlashOutline({ element }: { element: Element }) {
  const rect = useElementRect(element);
  return rect ? <Highlight element={element} rect={rect} variant="flash" label={false} /> : null;
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

/** What the comment mentions as the references it carries (see CommentReference); an element gone from the page since, none. */
function toReference(o: MentionOption): CommentReference[] {
  if (o.breakpoint !== undefined) return [{ kind: "breakpoint", name: o.label, width: o.breakpoint }];
  if (o.group === "Tokens") return [{ kind: "token", name: o.label, value: o.detail ?? "", ...(o.tokenFile ? { source: o.tokenFile } : {}) }];
  if (o.group === "Unlisted") return [{ kind: "unlisted", name: o.label }];
  const target = o.element?.isConnected ? describeElement(o.element) : undefined;
  if (o.group === "Components") return [{ kind: "component", name: o.label, ...(target ? { target } : {}), ...(o.source ? { source: o.source } : {}) }];
  return target ? [{ kind: "element", name: o.label, target }] : [];
}
