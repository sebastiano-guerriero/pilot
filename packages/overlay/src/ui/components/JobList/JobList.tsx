import type { JobRecord } from "../../../bridge/session.ts";
import { type ChangeCounts, changesLabel } from "../../changesLabel.ts";
import { px } from "../../px.ts";
import { TOOLBAR_HEIGHT, type ToolbarSpot } from "../../toolbarSpot.ts";

interface JobListProps {
  jobs: JobRecord[];
  onCancel(jobId: string): void;
  /** Where the toolbar was dragged to: the list goes with it (null: above the toolbar where it starts, JobList.css). */
  toolbar?: ToolbarSpot | null;
}

/** The list's width (JobList.css), its gap to the toolbar, and its distance to the window's edges, in px. */
const WIDTH = 280;
const GAP = 12;
const EDGE = 8;

/**
 * Next to a dragged toolbar: above it, centered on it, or below it when the
 * toolbar is in the top half of the window; kept on screen across.
 */
export function listPlacement(toolbar: ToolbarSpot, viewport: { width: number; height: number }): Record<string, string> {
  const left = Math.max(EDGE + WIDTH / 2, Math.min(toolbar.x, viewport.width - EDGE - WIDTH / 2));
  return toolbar.y > viewport.height / 2
    ? { left: px(left), bottom: px(viewport.height - toolbar.y + GAP) }
    : { left: px(left), top: px(toolbar.y + TOOLBAR_HEIGHT + GAP), bottom: "auto" };
}

/** The changes a job carries: its properties and its texts. */
function changeCounts(job: JobRecord): ChangeCounts {
  return job.changeSet.edits.reduce(
    (n, e) => ({ styles: n.styles + e.changes.length, texts: n.texts + (e.texts?.length ?? 0) }),
    { styles: 0, texts: 0 },
  );
}

/** What a job is, in words: its changes ("3 style changes"), or the task it asks for. */
export function whatText(job: JobRecord): string {
  if (job.changeSet.request?.kind === "responsive") return "Make responsive";
  if (job.changeSet.request?.kind === "break-and-fix") return "Break and fix";
  if (job.changeSet.request?.kind === "comment") return "Comment";
  if (job.changeSet.request?.kind === "props") return "Props";
  return changesLabel(changeCounts(job));
}

/** The longest a comment's words go in a job's description, in characters. */
const WORDS = 60;

/**
 * What a job is about, for its loader's tooltip: a comment's own words
 * (its latest message, cut to a line), with the edits that went with it;
 * a task by its name (the component's, for Props); edits by what they are.
 */
export function jobAbout(job: JobRecord): string {
  const request = job.changeSet.request;
  const edits = changeCounts(job);
  const withEdits = edits.styles || edits.texts ? `, with ${changesLabel(edits)}` : "";
  if (request?.kind === "comment") {
    const latest = [...request.thread].reverse().find((m) => m.from === "designer");
    const words = latest?.text.replace(/\s+/g, " ").trim() ?? "";
    const said = words ? `“${words.length > WORDS ? `${words.slice(0, WORDS - 1)}…` : words}”` : "A comment";
    return `${said}${withEdits}`;
  }
  if (request?.kind === "props") return `Props of ${request.component}`;
  if (request) return whatText(job);
  return changesLabel(edits);
}

/**
 * How long an agent has been on a job, from a minute on (" · 12 min"): a
 * long task isn't stuck (Pilot can't tell slow from stuck), but the designer
 * sees how long it's been.
 */
export function elapsed(since: string | undefined, now = Date.now()): string {
  const minutes = since ? Math.floor((now - Date.parse(since)) / 60_000) : 0;
  return minutes >= 1 ? ` · ${minutes} min` : "";
}

/** Where a job stands, in words. A task is checked at every width once done (checks/widths.ts). */
export function statusText(job: JobRecord): string {
  if (job.status === "queued") return "Waiting for an agent";
  if (job.status === "working") return `${job.agent?.label ?? "The agent"} is ${job.changeSet.request ? "working" : "applying"}${elapsed(job.takenAt)}`;
  if (job.status === "cancelled") return "Cancelled";
  if (job.changeSet.request?.kind === "comment" || job.changeSet.request?.kind === "props") return "Done";
  if (job.changeSet.request) return job.checked ? "Done" : "Checking widths";
  return job.checked ? "Applied" : "Checking the page";
}

/**
 * The jobs sent to agents, above the toolbar: where each stands (waiting,
 * an agent applying, checking the page, applied), with the agent's notes, and
 * Cancel for one not done yet. A follow-up (some changes didn't land the
 * first time) reads as the agent applying again. Placeholder look, pending
 * the real design.
 */
export function JobList({ jobs, onCancel, toolbar = null }: JobListProps) {
  const style = toolbar ? listPlacement(toolbar, { width: window.innerWidth, height: window.innerHeight }) : undefined;
  return (
    <div class="job-list" role="status" aria-live="polite" style={style}>
      {jobs.map((job) => {
        const open = job.status === "queued" || job.status === "working";
        return (
          <div key={job.id} class="job" data-status={job.status} data-checked={job.checked || undefined}>
            <div class="summary">
              <span class="status">{statusText(job)}</span>
              <span class="count">{whatText(job)}</span>
              {open && (
                <button type="button" class="action" onClick={() => onCancel(job.id)}>
                  Cancel
                </button>
              )}
            </div>
            {job.notes && <div class="notes">{job.notes}</div>}
          </div>
        );
      })}
    </div>
  );
}
