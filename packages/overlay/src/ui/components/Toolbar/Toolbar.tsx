import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { keyLabel } from "../../keys.ts";
import { px } from "../../px.ts";
import { clampSpot, type ToolbarSpot } from "../../toolbarSpot.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

/** How long the Send button says "Sent" (or "Queued"), in ms. */
const SENT_FOR = 1500;
/** How long the jobs button takes to leave (its exit animation, see Toolbar.css). */
const LEAVE_MS = 200;
/** Tooltips clear the toolbar: its 8px padding, then the usual 4px. */
const TIP_GAP = 12;

/** The tool that picks elements: Select (to edit them) or Comment; null when neither is on. */
export type Tool = "select" | "comment" | null;

interface ToolbarProps {
  /** The tool on (its button is pressed). */
  tool: Tool;
  /**
   * A tool's button was clicked: on (keeping the selection). Clicking the
   * one that's on doesn't turn it off (Esc does): Comment's goes to the next
   * thread that needs the designer (see `attention`), Select's does nothing.
   */
  onTool(tool: Exclude<Tool, null>): void;
  /** Comment threads that need the designer (the agent spoke last): a pill on the Comment button. */
  attention?: number;
  /** There's something to send: the button lights up. Sent to the agent Pilot runs for this page (`npx usepilot`); without it, `alerts.send` says so. */
  canSend: boolean;
  /** How many changes Send would send: a pill on the button. */
  sendCount?: number;
  /** Send; resolves to whether it worked, or to what the tooltip says instead of "Sent" ("Queued"). */
  onSend(): Promise<boolean | string> | boolean | string | void;
  /** How many changes Discard would take off the page (the unsent ones): dimmed and disabled at 0, and while Send has an alert. */
  discardCount?: number;
  /** Discard the changes not sent yet (one undo step). */
  onDiscard?(): void;
  /** TEMPORARY (ui/testPrompt.ts): copy the prompt Send would make now; whether it copied. None: no button. */
  onCopyPrompt?(): Promise<boolean>;
  /** Jobs not finished yet (waiting, an agent applying, checking): the jobs button shows while there are any. */
  pending: number;
  /** The jobs button: scroll to the next job's elements (see App's nextJob). */
  onNextJob(): void;
  /** Close: closes Pilot on every tab of the site (jobs go on; the shortcut opens it again). */
  onQuit(): void;
  /** Hide: out of sight in this tab, everything kept, until the shortcut brings it back (mountPilot). None: no button. */
  onHide?(): void;
  /** That shortcut (`alt+p`), for the tooltip. */
  hideShortcut?: string;
  /**
   * Jobs stuck (nothing will move them by itself, see PilotSession.stuck),
   * on the button they belong to: `comment` for comments and tasks asked in
   * a thread, `send` for the rest. The button's pill turns red with "!", and
   * its tooltip says what's wrong and what to do.
   */
  alerts?: { comment?: ToolbarAlert; send?: ToolbarAlert };
  /** Where it was dragged to (null: centered at the bottom). */
  spot?: ToolbarSpot | null;
  /** Dragged (by the strip along its top edge), or moved to stay on screen. */
  onMove?(spot: ToolbarSpot): void;
}

/**
 * The only UI visible while Pilot runs: select, Send, Discard, the jobs in progress
 * (only while there are some, with how many in a pill), a divider, quit.
 * Comment is divided from Select and Send too.
 * Send shows how many changes it would send in a pill (like the comments
 * to review), and is dimmed when there's nothing to send.
 */
/** An alert on a toolbar button: what's wrong, and what to do. */
export interface ToolbarAlert {
  title: string;
  detail: string;
}

/** The red "!" pill of a button with an alert. */
function AlertPill() {
  return (
    <span class="pill" data-alert aria-hidden="true">
      !
    </span>
  );
}

export function Toolbar({
  tool,
  onTool,
  attention = 0,
  canSend,
  sendCount = 0,
  onSend,
  discardCount = 0,
  onDiscard,
  onCopyPrompt,
  pending,
  onNextJob,
  onQuit,
  onHide,
  hideShortcut,
  alerts = {},
  spot = null,
  onMove,
}: ToolbarProps) {
  // After a send, the tooltip says so for a moment.
  const [done, setDone] = useState<boolean | string>(false);
  // After copying the prompt (TEMPORARY, ui/testPrompt.ts), the same.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), SENT_FOR);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), SENT_FOR);
    return () => clearTimeout(timer);
  }, [done]);
  const doneText = typeof done === "string" ? done : "Sent";
  const action = "Send to agent";
  const idle = "Nothing to send";

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
      <Tooltip
        text={alerts.comment?.title ?? (attention ? `${attention} ${attention === 1 ? "comment" : "comments"} to review` : "Comment")}
        detail={alerts.comment?.detail}
        shortcut={keyLabel("alt+c")}
        gap={TIP_GAP}
      >
        <button
          type="button"
          class="button"
          aria-pressed={tool === "comment"}
          aria-label={
            alerts.comment
              ? `Comment: ${alerts.comment.title}. ${alerts.comment.detail}`
              : attention
                ? `Comment: ${attention} to review, go to the next`
                : "Comment"
          }
          aria-keyshortcuts="Alt+C"
          onClick={() => onTool("comment")}
        >
          <Icon name="comment" />
          {alerts.comment ? (
            <AlertPill />
          ) : (
            attention > 0 && (
              <span class="pill" aria-hidden="true">
                {attention}
              </span>
            )
          )}
        </button>
      </Tooltip>
      <span class="divider" aria-hidden="true" />
      <Tooltip text="Select element" shortcut={keyLabel("alt+v")} gap={TIP_GAP}>
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
      {/* After a send, its tooltip says so for a moment, hovered or not. */}
      <Tooltip
        text={done ? doneText : (alerts.send?.title ?? (canSend ? action : idle))}
        detail={done ? undefined : alerts.send?.detail}
        gap={TIP_GAP}
        forceOpen={!!done}
      >
        <button
          type="button"
          class="button send"
          aria-label={
            done
              ? doneText
              : `${action}${sendCount ? ` (${sendCount} ${sendCount === 1 ? "change" : "changes"})` : ""}${alerts.send ? `. ${alerts.send.title}. ${alerts.send.detail}` : ""}`
          }
          data-ready={canSend || undefined}
          // With an alert it stays hoverable (its tooltip says what's stuck), only its icon dimmed when there's nothing to send.
          data-idle={!canSend && alerts.send ? "" : undefined}
          disabled={!canSend && !alerts.send}
          onClick={async () => {
            const result = await onSend();
            if (result !== false) setDone(typeof result === "string" ? result : true);
          }}
        >
          <Icon name="send" />
          {alerts.send ? (
            <AlertPill />
          ) : (
            canSend &&
            sendCount > 0 && (
              <span class="pill" aria-hidden="true">
                {sendCount}
              </span>
            )
          )}
        </button>
      </Tooltip>
      {/* Discard, right after Send: the changes Send would send (and those waiting for a job), off the page. Undo brings them back.
          Off while Send has a warning (the owner's call, 2026-11-26): what's stuck is sorted out first, nothing thrown away meanwhile. */}
      {onDiscard && (
        <Tooltip
          text={alerts.send ? "Discard is off while Send has a warning" : discardCount ? `Discard ${discardCount} ${discardCount === 1 ? "change" : "changes"}` : "Nothing to discard"}
          gap={TIP_GAP}
        >
          <button
            type="button"
            class="button discard"
            aria-label={
              alerts.send
                ? "Discard is off while Send has a warning"
                : discardCount
                  ? `Discard changes (${discardCount} ${discardCount === 1 ? "change" : "changes"})`
                  : "Nothing to discard"
            }
            disabled={!discardCount || !!alerts.send}
            onClick={onDiscard}
          >
            <Icon name="brush" />
          </button>
        </Tooltip>
      )}
      {/* TEMPORARY (ui/testPrompt.ts): the prompt Send would make now, copied; nothing is sent. */}
      {onCopyPrompt && (
        <Tooltip text={copied ? "Prompt copied" : discardCount ? "Copy the prompt (test)" : "Nothing to send"} gap={TIP_GAP} forceOpen={copied}>
          <button
            type="button"
            class="button"
            aria-label="Copy the prompt Send would send (test)"
            disabled={!discardCount}
            onClick={async () => {
              if (await onCopyPrompt()) setCopied(true);
            }}
          >
            <Icon name={copied ? "copied" : "copy"} />
          </button>
        </Tooltip>
      )}
      {jobs && (
        <span class="jobs-slot" data-leaving={jobs.leaving || undefined}>
          <Tooltip text={`${jobs.count} ${jobs.count === 1 ? "job" : "jobs"} running`} gap={TIP_GAP}>
            <button
              type="button"
              class="button jobs"
              aria-label={`${jobs.count} ${jobs.count === 1 ? "job" : "jobs"} in progress: show the next`}
              onClick={onNextJob}
            >
              <Icon name="ai-developer" class="developer" />
              <span class="pill" aria-hidden="true">
                {jobs.count}
              </span>
            </button>
          </Tooltip>
        </span>
      )}
      <span class="divider" aria-hidden="true" />
      {onHide && (
        // Out of sight, everything kept: the page as it is, to try a hover or a focus for real. Back with the
        // shortcut.
        // Nothing of Pilot shows while it's hidden, so the tooltip says the shortcut shows it too.
        <Tooltip text={hideShortcut ? "Hide/show Pilot" : "Hide Pilot"} shortcut={hideShortcut ? keyLabel(hideShortcut) : undefined} gap={TIP_GAP}>
          <button
            type="button"
            class="button"
            aria-label="Hide Pilot"
            aria-keyshortcuts={hideShortcut ? ariaShortcut(hideShortcut) : undefined}
            onClick={onHide}
          >
            <Icon name="hide" />
          </button>
        </Tooltip>
      )}
      <Tooltip text="Close Pilot" gap={TIP_GAP}>
        <button type="button" class="button" aria-label="Close Pilot" onClick={onQuit}>
          <Icon name="power" />
        </button>
      </Tooltip>
    </div>
  );
}

/** `alt+p` as `aria-keyshortcuts` writes it: `Alt+P`. */
function ariaShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((p) => p.trim())
    .map((p) => (p.length === 1 ? p.toUpperCase() : p[0]?.toUpperCase() + p.slice(1).toLowerCase()))
    .join("+");
}
