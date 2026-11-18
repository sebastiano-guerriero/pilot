import type { AgentInfo, AgentRequest, ChangeResult, ChangeSet, CommentAction, CommentAttachment, CommentMessage, ElementTarget, Job, JobStatus, WidthCheck } from "@pilot/protocol";
import { attachmentType } from "@pilot/protocol";
import { checkWidths, problemLines, snapshotAt, type StyleSnapshot, widthsToCheck } from "../checks/widths.ts";
import { describeElement } from "../dom/target.ts";
import { buildChangeSet, buildRequest } from "../edits/changeSet.ts";
import type { EditHistory, RecordedChange } from "../edits/history.ts";
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

/**
 * A comment thread on one element (the toolbar's Comment tool): the
 * designer's messages, each sent to the agent as a job carrying the thread
 * so far, and the agent's replies (its `pilot_done` notes). It stays (with
 * its pin) until the designer resolves it.
 */
export interface CommentThread {
  id: string;
  /** How to find the element again (after a reload, by its selector). */
  target: ElementTarget;
  messages: ThreadMessage[];
}

/**
 * A message as the thread keeps it: the designer's with the job it went in
 * (or `waiting`, written while a job was on the element: it goes once that's
 * finished, see PilotSession.comment), the agent's with the job it answers.
 */
export type ThreadMessage = Omit<CommentMessage, "attachments"> & {
  jobId?: string;
  replyTo?: string;
  waiting?: boolean;
  attachments?: ThreadAttachment[];
};

/** A file on a designer's message: the hub's id for it, and for an image a small preview (a data URL) for the thread. */
export type ThreadAttachment = CommentAttachment & { thumb?: string };

const STORAGE_KEY = "pilot:jobs";
const THREADS_KEY = "pilot:comments";
const HELD_KEY = "pilot:held";
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
  threads: CommentThread[] = loadThreads();
  readonly bridge: BridgeClient | null;
  private listeners = new Set<() => void>();
  private watching = new Map<string, () => void>();
  /**
   * The elements each job of this page load is on: a task's or a comment's
   * element, the elements an edits job changes (after a reload, found again
   * by their selectors).
   */
  private jobElements = new Map<string, Element[]>();
  /**
   * Elements whose changes the designer sent while a job was still on them:
   * they wait, and go as a job of their own once it's finished (see send).
   * Saved by selector, like the jobs.
   */
  private held = new Set<Element>(loadHeld());
  /** The element each comment thread is on, the same way. */
  private threadElements = new Map<string, Element>();
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
    // An agent arrived: changes held for want of one can go.
    this.bridge?.subscribe(() => {
      this.release();
      this.notify();
    });
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

  /** Unsent changes on elements that wait for a job to finish (sent while it was on them, see send). */
  get heldCount(): number {
    return this.history.changes({ unsent: true }).filter((c) => this.held.has(c.element)).length;
  }

  /**
   * Send: the changes not sent yet become a job for the agent. Changes on
   * an element a job is still on (see jobOn) wait instead: they go as a job
   * of their own once it's finished, so two jobs never work on one element
   * at once (two agents, or the agent's edit and the designer's next one
   * crossing). Null when nothing went now (nothing to send, all of it
   * waits, or no agent works on this page). A job the hub can't take right
   * now (it just went away) is kept, and posted again on the next connect.
   */
  send(): JobRecord | null {
    if (!this.canSendToAgent) return null;
    const unsent = this.history.changes({ unsent: true });
    for (const change of unsent) if (this.jobOn(change.element)) this.held.add(change.element);
    this.saveHeld();
    return this.sendChanges((change) => !this.held.has(change.element));
  }

  /** The unsent changes `only` picks, as a job. Null when it picks none. */
  private sendChanges(only: (change: RecordedChange) => boolean): JobRecord | null {
    const changes = this.history.changes({ unsent: true }).filter(only);
    if (!changes.length) return null;
    const id = newJobId();
    const changeSet = buildChangeSet(this.history, { unsent: true, id, only });
    this.history.send(id, only);
    this.jobElements.set(id, [...new Set(changes.map((c) => c.element))]);
    return this.post(id, changeSet);
  }

  /**
   * What waited for an element that's free now goes (with an agent to take
   * it): its held changes as a job of their own, its waiting comments as
   * their thread's next job.
   */
  private release(): void {
    if (!this.canSendToAgent) return;
    for (const thread of this.threads) {
      if (!thread.messages.some((m) => m.waiting)) continue;
      const element = this.threadElement(thread);
      if (element && !this.jobOn(element)) this.postComment(thread.id, element);
    }
    if (!this.held.size) return;
    const free = [...this.held].filter((element) => !this.jobOn(element));
    if (!free.length) return;
    for (const element of free) this.held.delete(element);
    this.saveHeld();
    this.sendChanges((change) => free.includes(change.element));
  }

  /**
   * A job taken back: what waited for it on its elements doesn't go by
   * itself (it would take the job's own changes along, unsent again); it's
   * all for the designer's next Send.
   */
  private unhold(job: JobRecord): void {
    for (const element of this.elementsOf(job)) this.held.delete(element);
    this.saveHeld();
  }

  /**
   * The job that isn't finished yet (waiting, an agent on it, being
   * checked, or its follow-up) on `element`, if any: a task about it, a
   * comment on it, or an edits job that changes it. While there's one, the
   * selection's actions give way to its status, and changes sent for the
   * element wait for it (see send).
   */
  jobOn(element: Element): JobRecord | null {
    return this.jobs.find((job) => unfinished(job) && this.elementsOf(job).includes(element)) ?? null;
  }

  /** The elements unfinished jobs are on, each with the job (the earliest, when several are). */
  get busy(): Array<{ element: Element; job: JobRecord }> {
    const found = new Map<Element, JobRecord>();
    for (const job of this.jobs) {
      if (!unfinished(job)) continue;
      for (const element of this.elementsOf(job)) if (!found.has(element)) found.set(element, job);
    }
    return [...found].map(([element, job]) => ({ element, job }));
  }

  /** Jobs not finished yet (see jobOn), oldest first: the agents' queue, then what's being checked. */
  get openJobs(): JobRecord[] {
    return this.jobs.filter(unfinished);
  }

  /** Whether a job can still be taken back: before the agent says it's done (see cancel). */
  canCancel(job: JobRecord): boolean {
    return job.status === "queued" || job.status === "working";
  }

  /** The elements a job is on (see jobElements), on the page. */
  elementsOf(job: JobRecord): Element[] {
    const known = this.jobElements.get(job.id)?.filter((e) => e.isConnected);
    if (known?.length) return known;
    const selectors = job.changeSet.request ? [job.changeSet.request.target.selector] : job.changeSet.edits.map((e) => e.target.selector);
    const found = selectors.map(find).filter((e): e is Element => !!e);
    if (found.length) this.jobElements.set(job.id, found);
    return found;
  }

  /**
   * A task for the agent about one element (Make responsive), as a job of
   * its own, apart from the changes: nothing of the history goes with it.
   * Null when no agent works on this page. When done there's nothing to
   * check (no designer values): it's accepted on the agent's word.
   */
  request(
    element: Element,
    kind: AgentRequest["kind"],
    extras: { id?: string; note?: string; attachments?: CommentAttachment[] } = {},
  ): JobRecord | null {
    if (!this.canSendToAgent || this.jobOn(element)) return null;
    const id = extras.id ?? newJobId();
    this.jobElements.set(id, [element]);
    const job = this.post(id, buildRequest(element, kind, { id, note: extras.note, attachments: extras.attachments }));
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

  // Comments

  /** The thread on `element`, if any (the element itself; after a reload, by its selector). */
  threadFor(element: Element): CommentThread | null {
    return this.threads.find((t) => this.threadElement(t) === element) ?? null;
  }

  /** The element a thread is on, when it's on the page. */
  threadElement(thread: CommentThread): Element | null {
    const known = this.threadElements.get(thread.id);
    if (known?.isConnected) return known;
    const found = find(thread.target.selector);
    if (found) this.threadElements.set(thread.id, found);
    return found;
  }

  /**
   * A comment on `element`: added to its thread (a new one for the first),
   * and sent to the agent at once, as a job carrying the thread so far.
   * While a job is on the element (see jobOn), it waits instead (`waiting`,
   * on the message) and goes once that's finished, as edits do (see send):
   * the agent couldn't read it mid-job anyway, and a second agent can't
   * take it and edit the same code meanwhile. `job` is null when it waits,
   * or when no agent works on this page: the comment is kept, and
   * `changeSet` is its prompt's, to copy.
   */
  comment(
    element: Element,
    text: string,
    attachments: ThreadAttachment[] = [],
    action?: CommentAction,
  ): { thread: CommentThread; job: JobRecord | null; changeSet: ChangeSet; waiting: boolean } {
    let thread = this.threadFor(element);
    if (!thread) {
      thread = { id: `thread_${newJobId().slice(4)}`, target: describeElement(element), messages: [] };
      this.threads = [...this.threads, thread];
      this.threadElements.set(thread.id, element);
    }
    const message: ThreadMessage = { from: "designer", text: text.trim(), at: new Date().toISOString() };
    if (attachments.length) message.attachments = attachments;
    if (action) message.action = action;
    const waiting = this.canSendToAgent && !!this.jobOn(element);
    if (waiting) message.waiting = true;
    const messages = [...thread.messages, message];
    this.patchThread(thread.id, { messages });
    const { job, changeSet } = waiting ? { job: null, changeSet: this.commentSet(element, messages) } : this.postComment(thread.id, element);
    return { thread: this.threads.find((t) => t.id === thread.id) as CommentThread, job, changeSet, waiting };
  }

  /** A comment job's change set: the thread so far, as the agent reads it. */
  private commentSet(element: Element, messages: ThreadMessage[], id?: string): ChangeSet {
    // Attachments go by id (the hub adds where it saved them); their previews stay here.
    const thread = messages.map(({ from, text, at, attachments, action }) => ({
      from,
      text,
      at,
      ...(attachments?.length ? { attachments: attachments.map(({ id, name }) => ({ id, name })) } : {}),
      ...(action ? { action } : {}),
    }));
    return buildRequest(element, "comment", { id, thread });
  }

  /**
   * Uploads a comment's files (images, text files, PDFs) to the hub, which
   * saves them in the OS temp folder for the agent; each with its id, and
   * an image with a small preview for the thread. Null when any fails, or
   * isn't a type Pilot takes (nothing is sent then).
   */
  async uploadFiles(files: File[], preview: (file: File) => Promise<string | undefined>): Promise<ThreadAttachment[] | null> {
    if (!this.bridge) return null;
    const bridge = this.bridge;
    const uploaded = await Promise.all(
      files.map(async (file) => {
        const type = attachmentType(file.name, file.type);
        if (!type) return null;
        const [id, thumb] = await Promise.all([bridge.upload(file, type), type.startsWith("image/") ? preview(file) : undefined]);
        return id ? { id, name: file.name, thumb } : null;
      }),
    );
    return uploaded.every((f) => f) ? (uploaded as ThreadAttachment[]) : null;
  }

  /**
   * The thread's comments not sent yet (the latest, and any that waited)
   * go to the agent as one job carrying the whole thread. With no agent,
   * nothing is posted: `changeSet` is the prompt to copy.
   */
  private postComment(threadId: string, element: Element): { job: JobRecord | null; changeSet: ChangeSet } {
    const thread = this.threads.find((t) => t.id === threadId) as CommentThread;
    const id = newJobId();
    // An action among what's unsent (`/responsive`): it goes as that task,
    // with the unsent messages' words as its note and their files.
    const unsent = thread.messages.filter((m) => m.from === "designer" && (m.waiting || !m.jobId));
    const action = unsent.find((m) => m.action)?.action;
    let job: JobRecord | null;
    let changeSet: ChangeSet;
    if (action) {
      const note = unsent
        .map((m) => m.text)
        .filter(Boolean)
        .join("\n\n");
      const attachments = unsent.flatMap((m) => m.attachments ?? []).map(({ id, name }) => ({ id, name }));
      job = this.request(element, action, { id, note, attachments });
      changeSet = job?.changeSet ?? buildRequest(element, action, { id, note, attachments });
      if (!job) return { job: null, changeSet };
    } else {
      changeSet = this.commentSet(element, thread.messages, id);
      if (!this.canSendToAgent) return { job: null, changeSet };
      this.jobElements.set(id, [element]);
      job = this.post(id, changeSet);
    }
    const messages = thread.messages.map((m) => (m.from === "designer" && (m.waiting || !m.jobId) ? { ...m, jobId: id, waiting: undefined } : m));
    this.patchThread(threadId, { messages });
    return { job, changeSet };
  }

  /**
   * Threads that need the designer: the agent spoke last (its reply came).
   * Replying (back to the agent) or resolving (gone) takes one off; opening
   * it doesn't. In the order the threads started, oldest first.
   */
  get attention(): CommentThread[] {
    return this.threads.filter(needsYou);
  }

  /** Where a thread's latest comment stands: its job, while Pilot still lists it. */
  threadJob(thread: CommentThread): JobRecord | null {
    const latest = [...thread.messages].reverse().find((m) => m.from === "designer");
    return (latest?.jobId && this.jobs.find((j) => j.id === latest.jobId)) || null;
  }

  /** The designer is done with a thread: it goes, with its pin. */
  resolve(threadId: string): void {
    this.threads = this.threads.filter((t) => t.id !== threadId);
    this.threadElements.delete(threadId);
    this.saveThreads();
  }

  /** A comment's (or a task asked from the comment box) job is done: the agent's notes are its reply in the thread (once). */
  private reply(job: JobRecord): void {
    const thread = this.threads.find((t) => t.messages.some((m) => m.jobId === job.id));
    if (!thread || thread.messages.some((m) => m.replyTo === job.id)) return;
    const reply: ThreadMessage = { from: "agent", text: job.notes?.trim() || "Done.", at: new Date().toISOString(), replyTo: job.id };
    this.patchThread(thread.id, { messages: [...thread.messages, reply] });
  }

  private patchThread(threadId: string, patch: Partial<CommentThread>): void {
    this.threads = this.threads.map((t) => (t.id === threadId ? { ...t, ...patch } : t));
    this.saveThreads();
  }

  private saveThreads(): void {
    try {
      sessionStorage.setItem(THREADS_KEY, JSON.stringify(this.threads));
    } catch {
      // Not saved; the threads still work for this page load.
    }
    this.notify();
  }

  /**
   * The task of `kind` about `element` that isn't finished yet (waiting, an
   * agent working, being checked, or its follow-up), if any: asking again
   * then would only make the agent do it twice (and two agents could edit
   * the same component at once). The element itself, not its selector, so
   * two cards that look alike each get their own. Once it's finished, a
   * new one is fine: another pass after the designer changed things.
   */
  openTask(element: Element, kind: AgentRequest["kind"]): JobRecord | null {
    for (const job of this.jobs) {
      const request = job.changeSet.request;
      if (request?.kind !== kind || !unfinished(job)) continue;
      if (this.elementsOf(job).includes(element)) return job;
    }
    return null;
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
    this.unhold(job);
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
    this.jobElements.delete(jobId);
    this.jobs = this.jobs.filter((j) => j.id !== jobId);
    this.save();
    this.release();
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
    if (job.status === "cancelled") {
      this.unhold(mine);
      this.history.unsend(job.id);
    }
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
    // A comment: nothing to check (free text). Its notes are the agent's reply.
    if (job.changeSet.request?.kind === "comment") {
      this.reply(job);
      return this.accept(job.id);
    }
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
    // Asked from the comment box: the agent's notes are its reply in the thread.
    this.reply(job);
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
    // The element is free: what waited for it goes.
    this.release();
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

  private saveHeld(): void {
    try {
      const selectors = [...this.held].map((element) => describeElement(element).selector);
      if (selectors.length) sessionStorage.setItem(HELD_KEY, JSON.stringify(selectors));
      else sessionStorage.removeItem(HELD_KEY);
    } catch {
      // Not saved: they still wait, for this page load.
    }
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

/** The agent spoke last in the thread: it's the designer's turn (reply or resolve). */
export function needsYou(thread: CommentThread): boolean {
  return thread.messages.at(-1)?.from === "agent";
}

/** Not finished yet: waiting, an agent on it, being checked, or its follow-up. */
function unfinished(job: JobRecord): boolean {
  return job.status !== "cancelled" && !job.checked;
}

/** The elements held before a reload (see PilotSession.held), found again by selector. */
function loadHeld(): Element[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(HELD_KEY) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.flatMap((s) => (typeof s === "string" ? (find(s) ?? []) : [])) : [];
  } catch {
    return [];
  }
}

/** The element a selector matches, or null (none, or not a valid selector). */
function find(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function newJobId(): string {
  return `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function loadThreads(): CommentThread[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(THREADS_KEY) ?? "[]") as CommentThread[];
    return Array.isArray(saved) ? saved.filter((t) => t?.id && t.target?.selector && Array.isArray(t.messages)) : [];
  } catch {
    return [];
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
