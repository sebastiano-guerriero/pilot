import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { px } from "../../px.ts";
import { clampSpot, type ToolbarSpot } from "../../toolbarSpot.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

/** How long the Send / Copy prompt button says "Sent" / "Copied", in ms. */
const COPIED_FOR = 1500;
/** How long the jobs button takes to leave (its exit animation, see Toolbar.css). */
const LEAVE_MS = 200;
/** Tooltips clear the toolbar: its 8px padding, then the usual 4px. */
const TIP_GAP = 12;

/** The tool that picks elements: Select (to edit them) or Comment; null when neither is on. */
export type Tool = "select" | "comment" | null;

interface ToolbarProps {
  /** The tool on (its button is pressed). */
  tool: Tool;
  /** A tool's button was clicked: on, or off when it was on. */
  onTool(tool: Exclude<Tool, null>): void;
  /**
   * What the Send button does: `send` the changes not sent yet to the agent
   * working on this page (it ran /pilot), or `copy` the prompt (no agent).
   */
  mode: "send" | "copy";
  /** There's something to send (or copy): the button lights up. */
  canSend: boolean;
  /**
   * Send or copy; resolves to whether it worked, or to what the tooltip
   * says instead of "Sent" ("Sends when the agent is done").
   */
  onSend(): Promise<boolean | string> | boolean | string | void;
  /** Jobs not finished yet (waiting, an agent applying, checking): the jobs button shows while there are any. */
  pending: number;
  /** The job list is open. */
  jobsOpen: boolean;
  onToggleJobs(): void;
  onQuit(): void;
  /** Where it was dragged to (null: centered at the bottom). */
  spot?: ToolbarSpot | null;
  /** Dragged (by the strip along its top edge), or moved to stay on screen. */
  onMove?(spot: ToolbarSpot): void;
}

/**
 * The only UI visible while Pilot runs: select, Send, the jobs in progress
 * (only while there are some, with how many in a pill), a divider, quit.
 * Send is the strong one: accent when there's something to send, dimmed
 * when there isn't.
 */
export function Toolbar({
  tool,
  onTool,
  mode,
  canSend,
  onSend,
  pending,
  jobsOpen,
  onToggleJobs,
  onQuit,
  spot = null,
  onMove,
}: ToolbarProps) {
  // After a send or copy, the tooltip says so for a moment.
  const [done, setDone] = useState<boolean | string>(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), COPIED_FOR);
    return () => clearTimeout(timer);
  }, [done]);
  const doneText = typeof done === "string" ? done : mode === "send" ? "Sent" : "Copied";
  const action = mode === "send" ? "Send to agent" : "Copy prompt";
  const idle = mode === "send" ? "Nothing to send" : "Nothing to copy";

  // The jobs button stays through its exit animation, showing the last count.
  const [jobs, setJobs] = useState<{ count: number; leaving: boolean } | null>(pending ? { count: pending, leaving: false } : null);
  useEffect(() => {
    if (pending > 0) return setJobs({ count: pending, leaving: false });
    if (!jobs) return;
    setJobs({ ...jobs, leaving: true });
    const timer = setTimeout(() => setJobs(null), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  // Dragging the strip along the top edge moves it, as on the property
  // dialog: by its center, so it stays centered on its spot as it widens
  // (the jobs button arriving), kept on screen (on window resize too).
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; from: ToolbarSpot } | null>(null);
  const [dragging, setDragging] = useState(false);
  const keepOnScreen = (want: ToolbarSpot) =>
    clampSpot(want, ref.current?.offsetWidth ?? 0, { width: window.innerWidth, height: window.innerHeight });
  useLayoutEffect(() => {
    if (!spot) return;
    const kept = keepOnScreen(spot);
    if (kept.x !== spot.x || kept.y !== spot.y) onMove?.(kept);
  });
  useEffect(() => {
    if (!spot) return;
    const onResize = () => onMove?.(keepOnScreen(spot));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [spot?.x, spot?.y]);
  const onDragStart = (e: PointerEvent) => {
    if (e.button !== 0 || !ref.current) return;
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, from: { x: rect.left + rect.width / 2, y: rect.top } };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) onMove?.(keepOnScreen({ x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y }));
  };
  const onDragEnd = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={ref}
      class="toolbar"
      role="toolbar"
      aria-label="Pilot"
      style={spot ? { left: px(spot.x), top: px(spot.y), bottom: "auto" } : undefined}
      data-dragging={dragging || undefined}
    >
      {/* The drag strip: along the top edge, over the toolbar's top padding
          (it adds no height), with the grip as the visual clue. */}
      <div
        class="drag-handle"
        aria-hidden="true"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <Icon name="grip" />
      </div>
      <Tooltip text="Comment" gap={TIP_GAP}>
        <button
          type="button"
          class="button"
          aria-pressed={tool === "comment"}
          aria-label="Comment"
          aria-keyshortcuts="Alt+C"
          onClick={() => onTool("comment")}
        >
          <Icon name="comment" />
        </button>
      </Tooltip>
      <Tooltip text="Select element" gap={TIP_GAP}>
        <button
          type="button"
          class="button"
          aria-pressed={tool === "select"}
          aria-label="Select element"
          aria-keyshortcuts="Alt+V"
          onClick={() => onTool("select")}
        >
          <Icon name="select" />
        </button>
      </Tooltip>
      {/* After a send or copy, its tooltip says so for a moment, hovered or not. */}
      <Tooltip text={done ? doneText : canSend ? action : idle} gap={TIP_GAP} forceOpen={!!done}>
        <button
          type="button"
          class="button send"
          aria-label={done ? doneText : mode === "send" ? "Send to agent" : "Copy prompt"}
          data-mode={mode}
          data-ready={canSend || undefined}
          disabled={!canSend}
          onClick={async () => {
            const result = await onSend();
            if (result !== false) setDone(typeof result === "string" ? result : true);
          }}
        >
          {mode === "copy" ? (
            // Copy prompt: the copy icon morphs into a check once it's copied (Toolbar.css).
            <span class="copy-morph" data-done={!!done || undefined}>
              <Icon name="copy" class="morph-copy" />
              <Icon name="copied" class="morph-check" />
            </span>
          ) : (
            <Icon name="send" />
          )}
        </button>
      </Tooltip>
      {jobs && (
        <span class="jobs-slot" data-leaving={jobs.leaving || undefined}>
          <Tooltip text={`${jobs.count} ${jobs.count === 1 ? "job" : "jobs"} running`} gap={TIP_GAP}>
            <button
              type="button"
              class="button jobs"
              aria-label={`${jobs.count} ${jobs.count === 1 ? "job" : "jobs"} in progress`}
              aria-expanded={jobsOpen}
              onClick={onToggleJobs}
            >
              <Icon name="loader" class="spinner" />
              <span class="pill" aria-hidden="true">
                {jobs.count}
              </span>
            </button>
          </Tooltip>
        </span>
      )}
      <span class="divider" aria-hidden="true" />
      <Tooltip text="Quit Pilot" gap={TIP_GAP}>
        <button type="button" class="button" aria-label="Quit Pilot" onClick={onQuit}>
          <Icon name="power" />
        </button>
      </Tooltip>
    </div>
  );
}
