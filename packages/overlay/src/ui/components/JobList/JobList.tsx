import type { JobRecord } from "../../../bridge/session.ts";
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

/** How many property changes a job carries. */
function changeCount(job: JobRecord): number {
  return job.changeSet.edits.reduce((n, e) => n + e.changes.length, 0);
}

/** What a job is, in words: its changes, or the task it asks for. */
export function whatText(job: JobRecord): string {
  if (job.changeSet.request?.kind === "responsive") return "Make responsive";
  if (job.changeSet.request?.kind === "comment") return "Comment";
  const n = changeCount(job);
  return `${n} ${n === 1 ? "change" : "changes"}`;
}

/** Where a job stands, in words. A task is checked at every width once done (checks/widths.ts). */
export function statusText(job: JobRecord): string {
  if (job.status === "queued") return "Waiting for an agent";
  if (job.status === "working") return `${job.agent?.label ?? "The agent"} is ${job.changeSet.request ? "working" : "applying"}`;
  if (job.status === "cancelled") return "Cancelled";
  if (job.changeSet.request?.kind === "comment") return "Done";
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
