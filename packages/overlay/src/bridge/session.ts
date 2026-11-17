import type { AgentInfo, AgentRequest, ChangeResult, ChangeSet, Job, JobStatus, WidthCheck } from "@pilot/protocol";
import { checkWidths, problemLines, snapshotAt, type StyleSnapshot, widthsToCheck } from "../checks/widths.ts";
import { buildChangeSet, buildRequest } from "../edits/changeSet.ts";
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
  /** For a task's follow-up: what Pilot's width check found (see Job.issues). */
  issues?: string[];
  /** A task: its element's styles at the designer's width before the job, to tell what the agent changed there. */
  baseline?: StyleSnapshot;
  /** A task: Pilot's last width check of it (the agent's, or the one after done). */
  check?: WidthCheck;
}

const STORAGE_KEY = "pilot:jobs";
/** How long a job whose changes all landed stays in the list. */
const APPLIED_LINGER = 8_000;
/** How long after a task is done Pilot checks it: hot reload's time. */
const TASK_SETTLE = 800;

export interface SessionOptions {
  /** The hub's URL, or false for no bridge (Send is never offered: Copy prompt only). */
  bridge: string | false;
  /** An agent ran /pilot for this page: launch Pilot. */
  onLaunch(agent: AgentInfo): void;
  /**
   * The page found an agent working on it (opened, or reloaded, after the
   * agent ran /pilot): launch Pilot, unless the designer quit it in this tab.
   */
  onAgentsArrived?(): void;
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
          onAgentsArrived: options.onAgentsArrived,
          onCheck: (requestId, jobId) => void this.answerCheck(requestId, jobId),
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
    const id = newJobId();
    const changeSet = buildChangeSet(this.history, { unsent: true, id });
    this.history.send(id);
    return this.post(id, changeSet);
  }

  /**
   * A task for the agent about one element (Make responsive), as a job of
   * its own, apart from the changes: nothing of the history goes with it.
   * Null when no agent works on this page. When done there's nothing to
   * check (no designer values): it's accepted on the agent's word.
   */
  request(element: Element, kind: AgentRequest["kind"]): JobRecord | null {
    if (!this.canSendToAgent) return null;
    const id = newJobId();
    const job = this.post(id, buildRequest(element, kind, { id }));
    // The element at the designer's width as the code has it now (no
    // previews), while the agent starts: to tell what it changed there.
    const { page, request } = job.changeSet;
    if (request) {
      void snapshotAt(page.url, request.target.selector, page.viewport.width).then((baseline) => {
        if (baseline && this.jobs.some((j) => j.id === id)) this.patch(id, { baseline });
      });
    }
    return job;
  }

  private post(id: string, changeSet: ChangeSet): JobRecord {
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

  /** A task's width check, now (`pilot_check_widths`, and after done). */
  private runCheck(job: JobRecord): Promise<WidthCheck> | null {
    const { page, request } = job.changeSet;
    if (!request) return null;
    const width = page.viewport.width;
    return checkWidths(page.url, request.target.selector, widthsToCheck(request.breakpoints, width), width, job.baseline);
  }

  /** The agent asked for a width check of one of this page's jobs (other tabs' jobs are theirs to answer). */
  private async answerCheck(requestId: string, jobId: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    const running = job && this.runCheck(job);
    if (!running) return;
    const check = await running;
    this.patch(jobId, { check });
    void this.bridge?.postCheck(requestId, check);
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
          issues: job.issues,
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
    if (job.changeSet.request) return this.verifyTask(job);
    const stop = watchJob(this.history, job.id, (results) => {
      this.watching.delete(job.id);
      const differences = results.filter((r) => r.outcome === "differs");
      if (differences.length && (job.attempt ?? 1) < 2) return this.followUp(job.id, differences);
      this.accept(job.id);
    });
    this.watching.set(job.id, stop);
  }

  /**
   * A done task (Make responsive): Pilot runs the width check once hot
   * reload had a moment. Problems go back to the agent once, as a
   * follow-up; after it, Pilot takes what the code gives.
   */
  private verifyTask(job: JobRecord): void {
    let stopped = false;
    this.watching.set(job.id, () => {
      stopped = true;
    });
    const t = setTimeout(async () => {
      this.timers.delete(t);
      const current = this.jobs.find((j) => j.id === job.id);
      const check = current && (await this.runCheck(current));
      if (stopped || !current || !check) return;
      this.watching.delete(job.id);
      this.patch(job.id, { check });
      if (check.problems && (current.attempt ?? 1) < 2) return this.followUp(job.id, [], problemLines(check));
      this.accept(job.id);
    }, TASK_SETTLE);
    this.timers.add(t);
  }

  /** Checked and accepted: it settles, and leaves the list after a moment. */
  private accept(jobId: string): void {
    this.history.settle(jobId);
    this.patch(jobId, { checked: true });
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.dismiss(jobId);
    }, APPLIED_LINGER);
    this.timers.add(t);
  }

  /** Back to the agent, once, with what the page gives instead (or a task's problems). Its changes stay previewed meanwhile. */
  private followUp(jobId: string, differences: ChangeResult[], issues?: string[]): void {
    this.patch(jobId, { status: "queued", attempt: 2, differences, issues, notes: undefined });
    const job = this.jobs.find((j) => j.id === jobId) as JobRecord;
    void this.bridge?.retry(jobId, differences, issues).then((ok) => {
      // The hub doesn't have it as done (a new hub, after a takeover): post the follow-up as a job.
      if (!ok) {
        void this.bridge?.postJob({ id: jobId, changeSet: job.changeSet, status: "queued", agent: job.agent, attempt: 2, differences, issues });
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

function newJobId(): string {
  return `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
