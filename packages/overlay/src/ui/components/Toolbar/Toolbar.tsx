import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

/** How long the Send / Copy prompt button says "Sent" / "Copied", in ms. */
const COPIED_FOR = 1500;
/** How long the jobs button takes to leave (its exit animation, see Toolbar.css). */
const LEAVE_MS = 200;
/** Tooltips clear the toolbar: its 8px padding, then the usual 4px. */
const TIP_GAP = 12;

interface ToolbarProps {
  /** Select mode is on (the select button is pressed). */
  selecting: boolean;
  onToggleSelect(): void;
  /**
   * What the Send button does: `send` the changes not sent yet to the agent
   * working on this page (it ran /pilot), or `copy` the prompt (no agent).
   */
  mode: "send" | "copy";
  /** There's something to send (or copy): the button lights up. */
  canSend: boolean;
  /** Send or copy; resolves to whether it worked. */
  onSend(): Promise<boolean> | boolean | void;
  /** Jobs not finished yet (waiting, an agent applying, checking): the jobs button shows while there are any. */
  pending: number;
  /** The job list is open. */
  jobsOpen: boolean;
  onToggleJobs(): void;
  onQuit(): void;
}

/**
 * The only UI visible while Pilot runs: select, Send, the jobs in progress
 * (only while there are some, with how many in a pill), a divider, quit.
 * Send is the strong one: accent when there's something to send, dimmed
 * when there isn't.
 */
export function Toolbar({
  selecting,
  onToggleSelect,
  mode,
  canSend,
  onSend,
  pending,
  jobsOpen,
  onToggleJobs,
  onQuit,
}: ToolbarProps) {
  // After a send or copy, the tooltip says so for a moment.
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), COPIED_FOR);
    return () => clearTimeout(timer);
  }, [done]);
  const doneText = mode === "send" ? "Sent" : "Copied";
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

  return (
    <div class="toolbar" role="toolbar" aria-label="Pilot">
      <Tooltip text="Select element" gap={TIP_GAP}>
        <button type="button" class="button" aria-pressed={selecting} aria-label="Select element" onClick={onToggleSelect}>
          <Icon name="select" />
        </button>
      </Tooltip>
      {/* After a send or copy, its tooltip says so for a moment, hovered or not. */}
      <Tooltip text={done ? doneText : canSend ? action : idle} gap={TIP_GAP} forceOpen={done}>
        <button
          type="button"
          class="button send"
          aria-label={done ? doneText : mode === "send" ? "Send to agent" : "Copy prompt"}
          data-mode={mode}
          data-ready={canSend || undefined}
          disabled={!canSend}
          onClick={async () => {
            if ((await onSend()) !== false) setDone(true);
          }}
        >
          {mode === "copy" ? (
            // Copy prompt: the copy icon morphs into a check once it's copied (Toolbar.css).
            <span class="copy-morph" data-done={done || undefined}>
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
