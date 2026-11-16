import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon/Icon.tsx";

/** How long the Send / Copy prompt button says "Sent" / "Copied", in ms. */
const COPIED_FOR = 1500;
/** How long the jobs button takes to leave (its exit animation, see Toolbar.css). */
const LEAVE_MS = 200;

interface ToolbarProps {
  /** Select mode is on (the select button is pressed). */
  selecting: boolean;
  onToggleSelect(): void;
  /**
   * What the Send button does: `send` the changes not sent yet to the agent
   * working on this page (it ran /pilot), or `copy` the prompt (no agent).
   */
  mode: "send" | "copy";
  /** The agent Send goes to ("Claude Code · app"), for its tooltip. */
  agentName?: string;
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
  agentName,
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
  const action = mode === "send" ? `Send to ${agentName ?? "the agent"}` : "Copy prompt";
  const idle = mode === "send" ? "No new changes to send" : "No changes to copy yet";

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
      <button
        type="button"
        class="button"
        aria-pressed={selecting}
        aria-label="Select an element"
        title="Select an element"
        onClick={onToggleSelect}
      >
        <Icon name="select" />
      </button>
      <button
        type="button"
        class="button send"
        aria-label={done ? doneText : mode === "send" ? "Send to agent" : "Copy prompt"}
        title={done ? doneText : canSend ? action : idle}
        data-mode={mode}
        data-ready={canSend || undefined}
        disabled={!canSend}
        onClick={async () => {
          if ((await onSend()) !== false) setDone(true);
        }}
      >
        <Icon name="send" />
      </button>
      {jobs && (
        <span class="jobs-slot" data-leaving={jobs.leaving || undefined}>
          <button
            type="button"
            class="button jobs"
            aria-label={`${jobs.count} ${jobs.count === 1 ? "job" : "jobs"} in progress`}
            aria-expanded={jobsOpen}
            title={`${jobs.count} ${jobs.count === 1 ? "job" : "jobs"} in progress`}
            onClick={onToggleJobs}
          >
            <Icon name="loader" class="spinner" />
            <span class="pill" aria-hidden="true">
              {jobs.count}
            </span>
          </button>
        </span>
      )}
      <span class="divider" aria-hidden="true" />
      <button type="button" class="button" aria-label="Quit Pilot" title="Quit Pilot" onClick={onQuit}>
        <Icon name="power" />
      </button>
    </div>
  );
}
