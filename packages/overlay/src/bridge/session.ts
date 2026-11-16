import type { AgentInfo, ChangeResult, ChangeSet, Job, JobStatus } from "@pilot/protocol";
import { buildChangeSet } from "../edits/changeSet.ts";
import type { EditHistory } from "../edits/history.ts";
import { watchJob } from "../edits/verify.ts";
import { BridgeClient, type BridgeState } from "./client.ts";

/**
 * The handoff to agents, for one page load (owned by mountPilot, like the
 * history). Send turns the changes not sent yet into a job; the hub gives it
 * to an agent working on this page (it ran /pilot); the page keeps previewing
 * the job's changes until the agent says it's done, then checks them against
 * the page's real CSS (edits/verify.ts): what landed stops being previewed.
 * What didn't goes back to the agent once, as a follow-up with what the page
 * gives instead; after that, Pilot takes what the code gives and stops
 * previewing the job. Meanwhile the designer keeps editing: new changes go in
 * the next job.
 *
 * The jobs are saved in the tab's sessionStorage next to the history, so a
 * reload (the agent's edits trigger plenty) loses nothing. The page is the
 * source of truth for them: on every connect it posts its unfinished jobs
 * again (the hub may be a new one, after its old process ended).
 */
export interface JobRecord {
  id: string;
  changeSet: ChangeSet;
  status: JobStatus;
  agent?: AgentInfo;
  /** The agent's notes, when done. */
  notes?: string;
  createdAt: string;
  /** 2 once it went back to the agent as a follow-up (see Job.attempt). */
  attempt?: number;
  /** For the follow-up: what the page gave instead of the designer's values. */
  differences?: ChangeResult[];
  /** Checked and accepted: what shows is the code. */
  checked?: boolean;
}

const STORAGE_KEY = "pilot:jobs";
/** How long a job whose changes all landed stays in the list. */
const APPLIED_LINGER = 8_000;

export interface SessionOptions {
  /** The hub's URL, or false for no bridge (Send is never offered: Copy prompt only). */
  bridge: string | false;
  /** An agent ran /pilot for this page: launch Pilot. */
  onLaunch(agent: AgentInfo): void;
}

export class PilotSession {
  jobs: JobRecord[] = [];
  readonly bridge: BridgeClient | null;
  private listeners = new Set<() => void>();
  private watching = new Map<string, () => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly history: EditHistory,
    options: SessionOptions,
  ) {
    this.jobs = load();
    this.bridge = options.bridge
      ? new BridgeClient(options.bridge, {
          onLaunch: options.onLaunch,
          onJob: (job) => this.update(job),
          onConnect: () => this.repost(),
        })
      : null;
    this.bridge?.subscribe(() => this.notify());
    for (const job of [...this.jobs]) {
      // Finished before the reload: nothing left to show.
      if (job.checked || job.status === "cancelled") this.dismiss(job.id);
      // Done before the reload, checking interrupted: check again.
      else if (job.status === "done") this.verify(job);
    }
  }

  start(): void {
    this.bridge?.start();
  }

  destroy(): void {
    this.bridge?.stop();
    for (const stop of this.watching.values()) stop();
    for (const t of this.timers) clearTimeout(t);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get state(): BridgeState {
    return this.bridge?.state ?? { connected: false, agents: [], waiting: 0 };
  }

  /** An agent works on this page: Send is offered (else Copy prompt is the way). */
  get canSendToAgent(): boolean {
    return this.state.connected && this.state.agents.length > 0;
  }

  /** Changes not sent yet. */
  get unsent(): number {
    return this.history.changes({ unsent: true }).length;
  }

  /**
   * Send: the changes not sent yet become a job for the agent. Null when
   * there's nothing to send or no agent works on this page. A job the hub
   * can't take right now (it just went away) is kept, and posted again on
   * the next connect.
   */
  send(): JobRecord | null {
    if (!this.canSendToAgent || !this.unsent) return null;
    const id = `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const changeSet = buildChangeSet(this.history, { unsent: true, id });
    this.history.send(id);
    const job: JobRecord = { id, changeSet, status: "queued", createdAt: new Date().toISOString() };
    this.jobs = [...this.jobs, job];
    this.save();
    void this.bridge?.postJob({ id, changeSet, status: "queued" });
    return job;
  }

  /** Take a job back before the agent is done: its changes are unsent again (they stay on the page). */
  cancel(jobId: string): void {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job || job.status === "done" || job.status === "cancelled") return;
    void this.bridge?.cancel(jobId);
    this.history.unsend(jobId);
    this.patch(jobId, { status: "cancelled" });
    this.dismiss(jobId);
  }

  /** Removes a job from the list; any of its changes still previewed are unsent again. */
  dismiss(jobId: string): void {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return;
    this.watching.get(jobId)?.();
    this.watching.delete(jobId);
    this.history.unsend(jobId);
    this.jobs = this.jobs.filter((j) => j.id !== jobId);
    this.save();
  }

  /** A job update from the hub. Jobs of other tabs on the same page are ignored. */
  private update(job: Job): void {
    const mine = this.jobs.find((j) => j.id === job.id);
    if (!mine || mine.status === "cancelled") return;
    // A stale update (after a takeover, or from before the follow-up).
    if ((job.attempt ?? 1) < (mine.attempt ?? 1)) return;
    if (mine.status === "done" && job.status !== "done" && (job.attempt ?? 1) === (mine.attempt ?? 1)) return;
    const becameDone = job.status === "done" && mine.status !== "done";
    this.patch(job.id, { status: job.status, agent: job.agent, notes: job.notes });
    if (job.status === "cancelled") this.history.unsend(job.id);
    if (becameDone) this.verify(this.jobs.find((j) => j.id === job.id) as JobRecord);
  }

  /** Connected (again): post the jobs the hub may not know (a new hub after a takeover). */
  private repost(): void {
    for (const job of this.jobs) {
      if (job.status === "queued" || job.status === "working") {
        void this.bridge?.postJob({
          id: job.id,
          changeSet: job.changeSet,
          status: job.status,
          agent: job.agent,
          attempt: job.attempt,
          differences: job.differences,
        });
      }
    }
  }

  /**
   * Checks a done job against the page. Changes that landed stop being
   * previewed as they land. The ones that didn't go back to the agent once,
   * as a follow-up; after the follow-up, Pilot accepts what the code gives:
   * the job's previews go, whatever they show.
   */
  private verify(job: JobRecord): void {
    if (this.watching.has(job.id)) return;
    const stop = watchJob(this.history, job.id, (results) => {
      this.watching.delete(job.id);
      const differences = results.filter((r) => r.outcome === "differs");
      if (differences.length && (job.attempt ?? 1) < 2) return this.followUp(job.id, differences);
      this.history.settle(job.id);
      this.patch(job.id, { checked: true });
      const t = setTimeout(() => {
        this.timers.delete(t);
        this.dismiss(job.id);
      }, APPLIED_LINGER);
      this.timers.add(t);
    });
    this.watching.set(job.id, stop);
  }

  /** Back to the agent, once, with what the page gives instead. Its changes stay previewed meanwhile. */
  private followUp(jobId: string, differences: ChangeResult[]): void {
    this.patch(jobId, { status: "queued", attempt: 2, differences, notes: undefined });
    const job = this.jobs.find((j) => j.id === jobId) as JobRecord;
    void this.bridge?.retry(jobId, differences).then((ok) => {
      // The hub doesn't have it as done (a new hub, after a takeover): post the follow-up as a job.
      if (!ok) {
        void this.bridge?.postJob({ id: jobId, changeSet: job.changeSet, status: "queued", agent: job.agent, attempt: 2, differences });
      }
    });
  }

  private patch(jobId: string, patch: Partial<JobRecord>): void {
    this.jobs = this.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j));
    this.save();
  }

  private save(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.jobs));
    } catch {
      // Not saved; the jobs still work for this page load.
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function load(): JobRecord[] {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    const jobs = saved ? (JSON.parse(saved) as JobRecord[]) : [];
    return Array.isArray(jobs) ? jobs.filter((j) => j?.id && j.changeSet) : [];
  } catch {
    return [];
  }
}
