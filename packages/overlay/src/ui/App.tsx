import type { WidthRange } from "@pilot/protocol";
import { useCallback, useEffect, useReducer, useRef, useState } from "preact/hooks";
import { type BoxArea, hidesSelection } from "../dom/boxModel.ts";
import { type EditableElement, isEditable } from "../dom/target.ts";
import { formatPrompt } from "@pilot/protocol";
import { buildChangeSet, copyText } from "../edits/changeSet.ts";
import { type EditHistory, historyShortcut } from "../edits/history.ts";
import { clickWidth } from "../edits/widths.ts";
import type { PilotDevOptions } from "../mount.tsx";
import { useElementPicker } from "../select/useElementPicker.ts";
import { useElementRect } from "../select/useElementRect.ts";
import { BoxAreas } from "./components/BoxAreas/BoxAreas.tsx";
import { GridOverlay } from "./components/GridOverlay/GridOverlay.tsx";
import { Highlight } from "./components/Highlight/Highlight.tsx";
import { PropertyDialog, type WidthPick } from "./components/PropertyDialog/PropertyDialog.tsx";
import type { PilotSession } from "../bridge/session.ts";
import { JobList } from "./components/JobList/JobList.tsx";
import { Toolbar } from "./components/Toolbar/Toolbar.tsx";
import { ViewportWidth } from "./components/ViewportWidth/ViewportWidth.tsx";
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
  const [selecting, setSelecting] = useState(!!dev);
  const [selected, setSelected] = useState<{ element: EditableElement; key: number } | null>(() => {
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
  const viewportWidth = useViewportWidth();
  // A click on the viewport width. With the dialog open, it goes to the
  // dialog, which sets the chip (a `from`/`to` typed in the search decides it).
  const [widthPick, setWidthPick] = useState<WidthPick | undefined>();

  const onPick = useCallback((element: EditableElement) => {
    onReattach?.(); // the page may have re-rendered since: changes find their elements again
    setSelected((prev) => (prev?.element === element ? prev : { element, key: (prev?.key ?? 0) + 1 }));
  }, []);

  // Areas of the selected element an editor wants shown (e.g. the padding
  // being hovered or dragged); while set, they replace the selection highlight.
  const [inspect, setInspect] = useState<BoxArea[] | null>(null);
  useEffect(() => setInspect(null), [selected?.key]);

  const [, refresh] = useReducer((n: number) => n + 1, 0);
  // Whether there's anything to copy: the toolbar's button follows the history.
  const [hasChanges, setHasChanges] = useState(() => history.changes().length > 0);
  useEffect(() => history.subscribe(() => setHasChanges(history.changes().length > 0)), [history]);
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
  const agentName = session?.state.agents[0]?.label;
  // Jobs not finished yet: waiting, an agent applying, checking the page.
  const pending = (session?.jobs ?? []).filter((j) => j.status === "queued" || j.status === "working" || (j.status === "done" && !j.checked)).length;
  // The job list opens from the toolbar's jobs button, and closes when there's nothing left in progress.
  const [jobsOpen, setJobsOpen] = useState(false);
  useEffect(() => {
    if (!pending) setJobsOpen(false);
  }, [pending]);

  // Cmd/Ctrl+Z undoes the last property change, Cmd/Ctrl+Shift+Z (or Ctrl+Y)
  // redoes it. Left alone when there's nothing to undo/redo, and when the
  // user is typing in one of the page's own fields.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = historyShortcut(e);
      if (!action) return;
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

  // The selected element disappeared (re-render, HMR): drop the selection.
  useEffect(() => {
    if (selected && !selected.element.isConnected) setSelected(null);
  }, [selected, selectedRect]);

  // Esc, one level at a time:
  // - something selected: clear the selection (inside the dialog, the dialog
  //   handles Esc itself: editor → search → clear → close);
  // - only the select tool on, nothing selected: turn the tool off.
  useEffect(() => {
    if (!selected && !selecting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) {
        if (e.composedPath().includes(host)) return;
        e.preventDefault();
        setSelected(null);
      } else {
        e.preventDefault();
        setSelecting(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selected, selecting, host]);

  const toggleSelect = () => {
    if (selecting) setSelected(null);
    setSelecting(!selecting);
  };

  const hideSelection = !!inspect?.some(hidesSelection);

  return (
    <>
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
            onClose={() => setSelected(null)}
            onInspect={setInspect}
            widths={widths}
            onWidthsChange={setWidths}
            viewportWidth={viewportWidth}
            widthPick={widthPick}
          />
        </>
      )}
      {/* The hover comes after the selection, so its label is drawn over the
          selection's outline, dots and grid lines (same layer: DOM order decides).
          The dialog and the toolbar are on a higher layer either way. */}
      {hovered && hoverRect && (
        <>
          <Highlight element={hovered} rect={hoverRect} variant="hover" nameAttributes={nameAttributes} />
          {/* A hovered grid shows its lines; numbers come with the selection. */}
          <GridOverlay element={hovered} part="lines" />
        </>
      )}
      <ViewportWidth
        width={viewportWidth}
        widths={widths}
        onPick={(width, shift) =>
          selected ? setWidthPick({ width, shift }) : setWidths((current) => clickWidth(current, width, shift))
        }
      />
      {session && jobsOpen && session.jobs.length > 0 && <JobList jobs={session.jobs} onCancel={(id) => session.cancel(id)} />}
      <Toolbar
        selecting={selecting}
        onToggleSelect={toggleSelect}
        mode={sendToAgent ? "send" : "copy"}
        agentName={agentName}
        canSend={sendToAgent ? (session?.unsent ?? 0) > 0 : hasChanges}
        onSend={sendToAgent ? () => !!session?.send() : copyPrompt}
        pending={pending}
        jobsOpen={jobsOpen}
        onToggleJobs={() => setJobsOpen((open) => !open)}
        onQuit={onQuit}
      />
    </>
  );
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}
