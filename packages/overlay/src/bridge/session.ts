import type { AgentInfo, AgentQuestion, AgentRequest, AgentSession, ChangeResult, ChangeSet, CommentAction, CommentAttachment, CommentMessage, CommentReference, ElementTarget, FileToken, Job, JobError, JobStatus, ProjectComponent, ProjectSkill, PropChange, PropSpec, WidthCheck } from "@pilot/protocol";
import { attachmentType, requestTargets } from "@pilot/protocol";
import { checkWidths, problemLines, snapshotAt, type StyleSnapshot, widthsToCheck } from "../checks/widths.ts";
import { componentProps } from "../dom/component.ts";
import { type ChangeCounts, countChanges } from "../ui/changesLabel.ts";
import { describeElement, findTarget, structuralSelector, uniqueSelector } from "../dom/target.ts";
import { buildChangeSet, buildRequest } from "../edits/changeSet.ts";
import type { EditHistory, RecordedChange } from "../edits/history.ts";
import { changedLook, type Look, looksOf } from "../edits/look.ts";
import { watchJob } from "../edits/verify.ts";
import { BridgeClient, type BridgeState } from "./client.ts";

/**
 * The handoff to agents, for one page load (owned by mountPilot, like the
 * history). Send turns the changes not sent yet into a job; the hub gives it
 * to Pilot running for this site (`npx usepilot`, which runs the agent); the page keeps previewing
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
  /** The agent asked the designer something when done (Job.question): asked in a thread, the job held until the answer. */
  question?: AgentQuestion;
  /** The designer's answer: the job went back to the agent with it. */
  answer?: string;
  /** The agent's notes, when done. */
  notes?: string;
  createdAt: string;
  /** 2 once it went back to the agent as a follow-up (see Job.attempt). */
  attempt?: number;
  /** For the follow-up: what the page gave instead of the designer's values. */
  differences?: ChangeResult[];
  /** Checked and accepted: what shows is the code. */
  checked?: boolean;
  /** When an agent took it, reported it done, and Pilot finished checking it (the latest attempt's): see timings. */
  takenAt?: string;
  doneAt?: string;
  checkedAt?: string;
  /** When the agent last showed it's at work on it, while it runs (Job.activeAt): a run quiet too long is stuck. */
  activeAt?: string;
  /** For a task's follow-up: what Pilot's width check found (see Job.issues). */
  issues?: string[];
  /** A task: its element's styles at the designer's width before the job, to tell what the agent changed there. */
  baseline?: StyleSnapshot;
  /** A task: Pilot's last width check of it (the agent's, or the one after done). */
  check?: WidthCheck;
  /** A `/props` job's answer: the component's props (Job.props). */
  props?: PropSpec[];
  /** The agent's session for it, when Pilot ran the agent (Job.session): its follow-up resumes it, and its thread keeps it. */
  session?: AgentSession;
  /** Pilot couldn't run the agent for it (Job.error): said where stuck jobs are, until the designer sends again. */
  error?: JobError;
  /** A thread's job: how its elements looked when it was sent (edits/look.ts), to tell whether the agent changed it. */
  look?: Array<Look | null>;
  /** What the designer can ask their agent to allow (Job.allow): copied from its reply. */
  allow?: string;
}

/**
 * A comment thread on one element (the toolbar's Comment tool): the
 * designer's messages, each sent to the agent as a job carrying the thread
 * so far, and the agent's replies (its notes). It stays (with
 * its pin) until the designer resolves it.
 */
export interface CommentThread {
  id: string;
  /** How to find the element again (after a reload, by its selector). */
  target: ElementTarget;
  /**
   * The other elements the thread is about, selected with it when the
   * designer last wrote in it (see PilotSession.comment). The thread, its
   * icon and the comment box are on `target`; its jobs are on all of them.
   */
  others?: ElementTarget[];
  messages: ThreadMessage[];
  /** The agent's session that answered it last (Job.session): its next message resumes it, so the agent remembers the thread. */
  session?: AgentSession;
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
  /** The agent's question about this job (see PilotSession.ask): the designer's next message in the thread is the answer. */
  asks?: string;
  /** The question's one-click answers. */
  choices?: string[];
  attachments?: ThreadAttachment[];
  /** The designer's edits on the comment's elements, not sent yet, go with it (see PilotSession.comment): when it's posted. */
  takesEdits?: boolean;
  /** How many of them went with it, for the thread (a number: saved before style and text were told apart). */
  edits?: ChangeCounts | number;
  /**
   * Pilot's note in the agent's place: the designer stopped the job (see
   * cancel). Not a reply to read (needsYou), and the agent reads it as
   * "stopped, maybe not done" in the thread's history.
   */
  stopped?: boolean;
  /** A `/props` list shown before the agent's reply, from the last time (see postComment): its reply replaces it. */
  early?: boolean;
  /** The agent's reply to `/props`: the component's props, for the designer to set (see PilotSession.setProps). */
  propList?: PropSpec[];
  /**
   * The agent's reply, once its job changed how the thread's elements look
   * (see watchLook): Edit manually shows under it, so the dialog can tweak
   * what it chose. Not for a reply that changed nothing the dialog edits.
   */
  restyled?: boolean;
  /**
   * The run was refused an MCP server or a site the designer can allow: the
   * request for their agent's chat (Job.allow), copied by the reply's Copy
   * instructions button, never shown or done by Pilot.
   */
  allow?: string;
};

/** A file on a designer's message: the hub's id for it, and for an image a small preview (a data URL) for the thread. */
export type ThreadAttachment = CommentAttachment & { thumb?: string };

/** How long after a thread's reply Pilot looks for its job's change on the page (see watchLook), and how often. */
const LOOK_WAIT = 10_000;
const LOOK_EVERY = 500;

const STORAGE_KEY = "pilot:jobs";
const THREADS_KEY = "pilot:comments";
const HELD_KEY = "pilot:held";
/** How long a job whose changes all landed stays in the list. */
const APPLIED_LINGER = 8_000;
/** How long after a task is done Pilot checks it: hot reload's time. */
const TASK_SETTLE = 800;
/** What the thread says when the designer stopped its job, in the agent's place; and how the agent reads it later. */
const STOPPED_NOTE = "Stopped. Write again to pick it up.";
const STOPPED_FOR_AGENT = "(The designer stopped this job before you reported it done: it may not be done.)";
/** How long Pilot waits for set props to show on the page before it takes them back to the agent, and how often it looks meanwhile. */
const PROPS_WAIT = 6000;
const PROPS_RECHECK = 400;
/**
 * How long a stuck state lasts before the page says so: past a reconnect
 * (the hub's process restarting). A run that failed is said at once.
 */
const STUCK_OFFLINE_MS = 5_000;
/**
 * How long an agent's run may go without a sign of work (Job.activeAt)
 * before it's said stuck: its service stalled. Agents print as they work
 * (each tool call; Claude Code as it thinks), every few seconds; a long
 * think stays well under this.
 */
export const QUIET_MS = 2 * 60_000;

/**
 * Jobs nothing will move by themselves, and why: the page says so (the
 * toolbar's pills, the elements' corners, the thread) instead of a loader
 * spinning for ever. `title` and `detail` are what to show; `jobs`, the ids
 * of the jobs it's about.
 */
export interface Stuck {
  kind: "offline" | "older-agent" | "no-agent" | "quiet" | "agent-error";
  title: string;
  detail: string;
  jobs: string[];
}

export interface SessionOptions {
  /** The hub's URL, or false for no bridge (nothing can be sent). */
  bridge: string | false;
  /** The page's project (`mountPilot({ project })`): how `npx usepilot` finds its own pages, and what the stuck messages name. */
  project?: string;
  /** Pilot started running for this site (`npx usepilot`): launch it. */
  onLaunch(agent: AgentInfo): void;
  /**
   * The page found an agent working on it (opened, or reloaded, after the
   * `npx usepilot` started for the site): launch Pilot, unless the designer closed it in this tab.
   */
  onAgentsArrived?(): void;
  /** The designer closed Pilot on this site, in another tab (or this one): close it here. */
  onQuit?(): void;
}

export class PilotSession {
  jobs: JobRecord[] = [];
  threads: CommentThread[] = loadThreads();
  readonly bridge: BridgeClient | null;
  /** The page's project (`mountPilot({ project })`), if its loader names it. */
  private project?: string;
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
          onQuit: options.onQuit,
        }, undefined, options.project)
      : null;
    this.project = options.project;
    // An agent arrived: changes held for want of one can go.
    this.bridge?.subscribe(() => {
      this.release();
      this.notify();
    });
    for (const job of [...this.jobs]) {
      // Finished before the reload: nothing left to show.
      if (job.checked || job.status === "cancelled") this.dismiss(job.id);
      // Done before the reload, checking interrupted: check again (a run that failed has nothing to check).
      else if (job.status === "done" && !job.error) this.verify(job);
    }
  }

  start(): void {
    this.bridge?.start();
    // Jobs from before a reload, and no hub to reach: that counts from now.
    this.watchStuck();
  }

  destroy(): void {
    this.bridge?.stop();
    for (const stop of this.watching.values()) stop();
    for (const t of this.timers) clearTimeout(t);
    clearTimeout(this.stuckTimer);
    clearTimeout(this.quietTimer);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get state(): BridgeState {
    return this.bridge?.state ?? { connected: false, agents: [], waiting: 0 };
  }

  /** Pilot runs for this page's site (`npx usepilot`): Send and comments go to the agent. */
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
   * Discard: the changes not sent yet leave the page (EditHistory.discard,
   * one undo step), and nothing waits to go after a job anymore: brought
   * back by undo, they wait for the next Send. Returns how many went.
   */
  discard(): number {
    const count = this.history.discard();
    if (this.held.size) {
      this.held.clear();
      this.saveHeld();
    }
    return count;
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
      if (element && !this.anyBusy([element, ...this.threadOthers(thread)])) this.postComment(thread.id, element);
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
    const { request, edits } = job.changeSet;
    const targets = request ? requestTargets(request) : edits.map((e) => e.target);
    const found = targets.map((t) => findTarget(t)).filter((e): e is Element => !!e);
    if (found.length) this.jobElements.set(job.id, found);
    return found;
  }

  /**
   * A task for the agent about one element (Make responsive), or several
   * selected together (`others`), as one job of its own, apart from the
   * changes: nothing of the history goes with it.
   * Null when no agent works on this page. When done there's nothing to
   * check (no designer values): it's accepted on the agent's word.
   */
  request(
    element: Element,
    kind: AgentRequest["kind"],
    extras: { id?: string; note?: string; attachments?: CommentAttachment[]; references?: CommentReference[]; others?: Element[] } = {},
  ): JobRecord | null {
    const others = extras.others ?? [];
    if (!this.canSendToAgent || this.anyBusy([element, ...others])) return null;
    const id = extras.id ?? newJobId();
    this.jobElements.set(id, [element, ...others]);
    const job = this.post(id, buildRequest(element, kind, { id, note: extras.note, attachments: extras.attachments, references: extras.references, others }));
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

  /** Whether a job is on any of `elements` (see jobOn). */
  private anyBusy(elements: Element[]): boolean {
    return elements.some((e) => this.jobOn(e));
  }

  /** The other elements a thread is about (see CommentThread.others), the ones on the page. */
  threadOthers(thread: CommentThread): Element[] {
    return (thread.others ?? []).map((t) => findTarget(t)).filter((e): e is Element => !!e);
  }

  /** The element a thread is on, when it's on the page. */
  threadElement(thread: CommentThread): Element | null {
    const known = this.threadElements.get(thread.id);
    if (known?.isConnected) return known;
    const found = findTarget(thread.target);
    if (!found) return null;
    this.threadElements.set(thread.id, found);
    // Found another way (its classes changed, or its selector now finds another element first): its selector as it is now, so the next look is direct.
    if (find(thread.target.selector) !== found) this.patchThread(thread.id, { target: { ...thread.target, selector: uniqueSelector(found), at: structuralSelector(found) } });
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
   *
   * With `others` (several elements selected), the comment is about all of
   * them: one job, the thread on `element`. The thread keeps what was
   * selected when the designer last wrote in it, for its next jobs.
   */
  comment(
    element: Element,
    text: string,
    attachments: ThreadAttachment[] = [],
    action?: CommentAction,
    others: Element[] = [],
    references: CommentReference[] = [],
    takesEdits = false,
    props?: CommentMessage["props"],
    skill?: string,
  ): { thread: CommentThread; job: JobRecord | null; changeSet: ChangeSet; waiting: boolean } {
    let thread = this.threadFor(element);
    // The agent asked something here: this message is the answer, and goes with its job.
    const asked = thread && this.canSendToAgent ? this.openQuestion(thread) : null;
    if (thread && asked) {
      const text_ = text.trim();
      if (!text_) return { thread, job: null, changeSet: asked.changeSet, waiting: false };
      const message: ThreadMessage = { from: "designer", text: text_, at: new Date().toISOString(), jobId: asked.id };
      this.patchThread(thread.id, { messages: [...thread.messages, message] });
      this.answer(asked, text_);
      const answered = this.jobs.find((j) => j.id === asked.id) as JobRecord;
      return { thread: this.threads.find((t) => t.id === thread?.id) as CommentThread, job: answered, changeSet: answered.changeSet, waiting: false };
    }
    if (!thread) {
      thread = { id: `thread_${newJobId().slice(4)}`, target: describeElement(element), messages: [] };
      this.threads = [...this.threads, thread];
      this.threadElements.set(thread.id, element);
    }
    const otherTargets = others.filter((e) => e !== element).map(describeElement);
    thread = { ...thread, others: otherTargets.length ? otherTargets : undefined };
    this.patchThread(thread.id, { others: thread.others });
    const message: ThreadMessage = { from: "designer", text: text.trim(), at: new Date().toISOString() };
    if (attachments.length) message.attachments = attachments;
    if (action) message.action = action;
    // A skill goes with a comment (an action is a task of its own instead).
    else if (skill) message.skill = skill;
    if (references.length) message.references = references;
    // Not with an action: a task goes apart from the changes (see request), which wait for Send.
    if (takesEdits && !action) message.takesEdits = true;
    // Not with an action either: props go with a comment.
    if (props?.set.length && !action) message.props = props;
    const waiting = this.canSendToAgent && this.anyBusy([element, ...others]);
    if (waiting) message.waiting = true;
    const messages = [...thread.messages, message];
    this.patchThread(thread.id, { messages });
    const { job, changeSet } = waiting ? { job: null, changeSet: this.commentSet(element, messages, others) } : this.postComment(thread.id, element);
    return { thread: this.threads.find((t) => t.id === thread.id) as CommentThread, job, changeSet, waiting };
  }

  /** A comment job's change set: the thread so far, as the agent reads it. */
  private commentSet(element: Element, messages: ThreadMessage[], others: Element[], id?: string, session?: AgentSession): ChangeSet {
    // Attachments go by id (the hub adds where it saved them); their previews stay here.
    const thread = messages.map(({ from, text, at, attachments, action, skill, references, props, stopped }) => ({
      from,
      // Pilot's note, not the agent's words: what it means for the work.
      text: stopped ? STOPPED_FOR_AGENT : text,
      at,
      ...(attachments?.length ? { attachments: attachments.map(({ id, name }) => ({ id, name })) } : {}),
      ...(action ? { action } : {}),
      ...(skill ? { skill } : {}),
      ...(references?.length ? { references } : {}),
      ...(props ? { props } : {}),
    }));
    const set = buildRequest(element, "comment", { id, thread, others });
    // The thread's agent session: resumed, so the agent remembers the thread.
    if (session && set.request?.kind === "comment") set.request.session = session;
    return set;
  }

  /**
   * Uploads a comment's files (images, text files, PDFs) to the hub, which
   * saves them in the OS temp folder for the agent; each with its id, and
   * an image with a small preview for the thread. Null when any fails, or
   * isn't a type Pilot takes (nothing is sent then).
   */
  /** The project's components, for the `@` list (see BridgeClient.components); none without an agent on the page. */
  projectComponents(): Promise<ProjectComponent[]> {
    return this.bridge && this.canSendToAgent ? this.bridge.components() : Promise.resolve([]);
  }

  /** The agent's skills, for the `/` list (see BridgeClient.skills); none without an agent on the page. */
  projectSkills(): Promise<ProjectSkill[]> {
    return this.bridge && this.canSendToAgent ? this.bridge.skills() : Promise.resolve([]);
  }

  /** The project's file tokens (see BridgeClient.tokens); none without an agent on the page. */
  projectTokens(): Promise<FileToken[]> {
    return this.bridge && this.canSendToAgent ? this.bridge.tokens() : Promise.resolve([]);
  }

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
    const others = this.threadOthers(thread);
    const id = newJobId();
    // An action among what's unsent (`/responsive`): it goes as that task,
    // with the unsent messages' words as its note and their files.
    const unsent = thread.messages.filter((m) => m.from === "designer" && (m.waiting || !m.jobId));
    const action = unsent.find((m) => m.action)?.action;
    let job: JobRecord | null;
    let changeSet: ChangeSet;
    let sentEdits: ChangeCounts | null = null;
    if (action) {
      const note = unsent
        .map((m) => m.text)
        .filter(Boolean)
        .join("\n\n");
      const attachments = unsent.flatMap((m) => m.attachments ?? []).map(({ id, name }) => ({ id, name }));
      const references = unsent.flatMap((m) => m.references ?? []);
      job = this.request(element, action, { id, note, attachments, references, others });
      changeSet = job?.changeSet ?? buildRequest(element, action, { id, note, attachments, references, others });
      if (!job) return { job: null, changeSet };
    } else {
      changeSet = this.commentSet(element, thread.messages, others, id, thread.session);
      if (!this.canSendToAgent) return { job: null, changeSet };
      // The designer's edits on these elements, not sent yet, go with the
      // comment when it asks (its chip, kept): one job, checked like Send's
      // once the agent is done (see verify), the comment's reply in the thread.
      const elements = [element, ...others];
      const only = (change: RecordedChange) => elements.includes(change.element);
      const taken = unsent.some((m) => m.takesEdits) ? this.history.changes({ unsent: true }).filter(only) : [];
      const edits = taken.length;
      if (edits) {
        const taken = buildChangeSet(this.history, { unsent: true, id, only });
        changeSet = { ...changeSet, edits: taken.edits, ...(taken.fileTokens ? { fileTokens: taken.fileTokens } : {}) };
        this.history.send(id, only);
        for (const e of elements) this.held.delete(e);
        this.saveHeld();
      }
      if (edits) sentEdits = countChanges(taken);
      this.jobElements.set(id, elements);
      job = this.post(id, changeSet);
    }
    const messages = thread.messages.map((m) =>
      m.from === "designer" && (m.waiting || !m.jobId)
        ? { ...m, jobId: id, waiting: undefined, takesEdits: undefined, ...(sentEdits && m === unsent.at(-1) ? { edits: sentEdits } : {}) }
        : m,
    );
    this.patchThread(threadId, { messages });
    // `/props` for a component listed before: its list at once, in the reply's
    // place, while the agent reads the code again; its reply updates it (new
    // props show, gone ones go).
    const props = job?.changeSet.request?.kind === "props" ? job.changeSet.request : null;
    const known = props && knownProps(props.component, props.target.source?.file);
    if (job && props && known) {
      const thread = this.threads.find((t) => t.id === threadId) as CommentThread;
      const early: ThreadMessage = {
        from: "agent",
        text: `${props.component}'s props, from the last list. Checking the code for changes…`,
        at: new Date().toISOString(),
        replyTo: job.id,
        propList: known,
        early: true,
      };
      this.patchThread(threadId, { messages: [...thread.messages, early] });
    }
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
    if (!thread) return;
    // The session that answered: the thread's next message resumes it.
    if (job.session && job.session.id !== thread.session?.id) this.patchThread(thread.id, { session: job.session });
    const request = job.changeSet.request;
    // A `/props` list: remembered for this component, for the next `/props`.
    if (request?.kind === "props" && job.props?.length) rememberProps(request.component, request.target.source?.file, job.props);
    const reply: ThreadMessage = { from: "agent", text: job.notes?.trim() || "Done.", at: new Date().toISOString(), replyTo: job.id, ...(job.allow ? { allow: job.allow } : {}) };
    if (job.props?.length) reply.propList = job.props;
    // The list shown early (see postComment): the agent's reply takes its place.
    const early = thread.messages.find((m) => m.replyTo === job.id && m.early);
    if (early) {
      const { early: _, ...updated } = { ...early, ...reply, propList: reply.propList ?? early.propList };
      return this.patchThread(thread.id, { messages: thread.messages.map((m) => (m === early ? updated : m)) });
    }
    if (thread.messages.some((m) => m.replyTo === job.id)) return;
    this.patchThread(thread.id, { messages: [...thread.messages, reply] });
    this.watchLook(thread.id, job);
  }

  /**
   * After a thread's reply: whether its job changed how the thread's
   * elements look, once the code is on the page. Hot reload can come after
   * the reply, so Pilot looks again every LOOK_EVERY, up to LOOK_WAIT; the
   * first change marks the reply `restyled` (Edit manually shows), and
   * nothing changed by then, it stays without. The elements are found again
   * by their targets: a swapped icon is the new one.
   */
  private watchLook(threadId: string, job: JobRecord): void {
    const before = job.look;
    const request = job.changeSet.request;
    if (!before || !request) return;
    const targets = requestTargets(request);
    const until = Date.now() + LOOK_WAIT;
    const look = () => {
      const after = looksOf(this.history, targets.map((t) => findTarget(t)));
      if (changedLook(before, after)) {
        const thread = this.threads.find((t) => t.id === threadId);
        if (!thread) return;
        return this.patchThread(threadId, { messages: thread.messages.map((m) => (m.from === "agent" && m.replyTo === job.id ? { ...m, restyled: true } : m)) });
      }
      if (Date.now() >= until) return;
      const t = setTimeout(() => {
        this.timers.delete(t);
        look();
      }, LOOK_EVERY);
      this.timers.add(t);
    };
    look();
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
    // Sending again: the runs that failed are said no more (their changes are unsent again already).
    for (const failed of this.jobs.filter((j) => j.error)) this.dismiss(failed.id);
    const job: JobRecord = { id, changeSet, status: "queued", createdAt: new Date().toISOString() };
    // A thread's job (a comment, a task): how its elements look now, for its reply (see watchLook).
    if (changeSet.request) job.look = looksOf(this.history, requestTargets(changeSet.request).map((t) => findTarget(t)));
    this.jobs = [...this.jobs, job];
    this.save();
    void this.bridge?.postJob({ id, changeSet, status: "queued" });
    return job;
  }

  /** Take a job back before the agent is done: its changes are unsent again (they stay on the page). */
  cancel(jobId: string): void {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job?.error) return this.dismiss(jobId);
    if (!job || job.status === "done" || job.status === "cancelled") return;
    void this.bridge?.cancel(jobId);
    this.unhold(job);
    this.history.unsend(jobId);
    this.patch(jobId, { status: "cancelled" });
    this.dismiss(jobId);
    // A thread's job: a note where the reply would be, so the thread says what happened.
    const thread = this.threads.find((t) => t.messages.some((m) => m.from === "designer" && m.jobId === jobId));
    if (thread && !thread.messages.some((m) => m.replyTo === jobId && !m.early)) {
      // A props list shown early stays, as the last list (no agent is checking it now).
      const messages = thread.messages.map((m) =>
        m.replyTo === jobId && m.early ? { ...m, early: undefined, replyTo: undefined, text: m.text.replace(/ Checking the code for changes…$/, "") } : m,
      );
      const note: ThreadMessage = { from: "agent", text: STOPPED_NOTE, at: new Date().toISOString(), replyTo: jobId, stopped: true };
      this.patchThread(thread.id, { messages: [...messages, note] });
    }
  }

  /**
   * The designer closed Pilot (the toolbar's last button), for the whole
   * site: its other pages close it too (Hub.quit). Jobs go on: Pilot keeps
   * running the agent for them, and checks them when it's open again.
   */
  quit(): void {
    void this.bridge?.quit();
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
    // (Back from done is the follow-up, a new attempt, or an answer to the agent's question.)
    if (mine.status === "done" && job.status !== "done" && (job.attempt ?? 1) === (mine.attempt ?? 1) && !(job.answer && !mine.answer)) return;
    const becameDone = job.status === "done" && mine.status !== "done";
    this.patch(job.id, {
      status: job.status,
      agent: job.agent,
      notes: job.notes,
      takenAt: job.takenAt,
      doneAt: job.doneAt,
      activeAt: job.activeAt,
      question: job.question ?? mine.question,
      answer: job.answer ?? mine.answer,
      ...(job.props ? { props: job.props } : {}),
      session: job.session ?? mine.session,
      error: job.error,
      ...(job.allow ? { allow: job.allow } : {}),
    });
    if (job.status === "cancelled") {
      this.unhold(mine);
      this.history.unsend(job.id);
    }
    if (!becameDone) return;
    const done = this.jobs.find((j) => j.id === job.id) as JobRecord;
    // Pilot couldn't run the agent: its changes are unsent again (still previewed, for the next Send), and it's said until then.
    if (done.error) {
      this.unhold(done);
      this.history.unsend(done.id);
      return;
    }
    if (awaitsAnswer(done)) this.ask(done);
    else this.verify(done);
  }

  /**
   * The agent asked the designer something (pilot_done's question, mostly
   * "all of them, or only this one?"): Pilot asks it in a comment thread,
   * the job's own (a comment's), else the thread on the element it's about
   * (the question's `element`, its number in the prompt), or on its first
   * element, else a new one there (about that element, or all of them when
   * it names none). The job isn't checked
   * meanwhile, and stays on its elements; the designer's next message in
   * the thread is the answer (see comment), and the job goes back to the
   * agent with it.
   */
  private ask(job: JobRecord): void {
    const question = job.question;
    if (!question) return;
    const { request, edits } = job.changeSet;
    const targets = request ? requestTargets(request) : edits.map((e) => e.target);
    // The element it's about, when it names one of them (the prompt numbers them from 1).
    const about = question.element ? targets[question.element - 1] : undefined;
    const aboutElement = about ? findTarget(about) : null;
    const [first] = aboutElement ? [aboutElement] : this.elementsOf(job);
    let thread = this.threads.find((t) => t.messages.some((m) => m.jobId === job.id || m.asks === job.id)) ?? (first ? this.threadFor(first) : null);
    if (thread?.messages.some((m) => m.asks === job.id)) return;
    if (!thread) {
      const [target, ...others] = about ? [about] : targets;
      if (!target) return;
      thread = { id: `thread_${newJobId().slice(4)}`, target, ...(others.length ? { others } : {}), messages: [] };
      this.threads = [...this.threads, thread];
      if (first) this.threadElements.set(thread.id, first);
    }
    const message: ThreadMessage = {
      from: "agent",
      text: question.text,
      at: new Date().toISOString(),
      asks: job.id,
      ...(question.choices?.length ? { choices: question.choices } : {}),
    };
    this.patchThread(thread.id, { messages: [...thread.messages, message] });
  }

  /** The job whose question is waiting for the designer's answer in `thread`, if any. */
  openQuestion(thread: CommentThread): JobRecord | null {
    const asked = [...thread.messages].reverse().find((m) => m.asks);
    const job = asked && this.jobs.find((j) => j.id === asked.asks);
    return job && awaitsAnswer(job) ? job : null;
  }

  /** The designer answered a job's question: back to the agent with it (posted again when the hub doesn't have it, a new hub). */
  private answer(job: JobRecord, answer: string): void {
    this.patch(job.id, { status: "queued", answer, notes: undefined });
    void this.bridge?.answer(job.id, answer).then((ok) => {
      if (!ok) {
        const { changeSet, agent, attempt, question, session } = job;
        void this.bridge?.postJob({ id: job.id, changeSet, status: "queued", agent, attempt, question, answer, session });
      }
    });
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
          question: job.question,
          answer: job.answer,
          session: job.session,
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
    // A comment: its notes are the agent's reply. The words are free text,
    // nothing to check; edits that went with it are checked as Send's are.
    const comment = job.changeSet.request?.kind === "comment";
    // `/props`: the agent's list is its reply, with nothing to check (it changed no code).
    if (job.changeSet.request?.kind === "props") {
      this.reply(job);
      return this.accept(job.id);
    }
    // Props the designer set from the thread: Pilot reads the instance again.
    if (comment && !job.changeSet.edits.length && this.propsSet(job)) return this.verifyProps(job);
    if (comment && !job.changeSet.edits.length) {
      this.reply(job);
      return this.accept(job.id);
    }
    if (job.changeSet.request && !comment) return this.verifyTask(job);
    // A comment with edits, or an edits job the designer answered a question about: the agent's notes are its reply in that thread.
    if (comment || job.answer) this.reply(job);
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

  /** The props a comment job set (the thread's message it went with), if it set any. */
  private propsSet(job: JobRecord): PropChange[] | null {
    const request = job.changeSet.request;
    if (request?.kind !== "comment") return null;
    return [...request.thread].reverse().find((m) => m.from === "designer" && m.props)?.props?.set ?? null;
  }

  /**
   * Props set from the thread: Pilot reads the instance's props on the page
   * again (compared as text: `3` is `"3"`) until they're what the designer
   * picked, or PROPS_WAIT passed (hot reload takes a moment, longer in some
   * frameworks). What isn't goes back to the agent once; after that Pilot
   * takes what the code gives.
   */
  private verifyProps(job: JobRecord): void {
    this.reply(job);
    let stopped = false;
    this.watching.set(job.id, () => {
      stopped = true;
    });
    const until = Date.now() + PROPS_WAIT;
    const check = () => {
      if (stopped) return;
      const current = this.jobs.find((j) => j.id === job.id);
      const [element] = this.elementsOf(job);
      const now = element ? componentProps(element)?.props : undefined;
      const set = this.propsSet(job) ?? [];
      const issues = now
        ? set.filter((c) => String(now[c.name]) !== String(c.to)).map((c) => `\`${c.name}\` is ${now[c.name] === undefined ? "not set" : `\`${JSON.stringify(now[c.name])}\``}, the designer picked \`${JSON.stringify(c.to)}\``)
        : [];
      if (issues.length && Date.now() < until) return later(PROPS_RECHECK);
      this.watching.delete(job.id);
      if (current && issues.length && (current.attempt ?? 1) < 2) return this.followUp(job.id, [], issues);
      this.accept(job.id);
    };
    const later = (ms: number) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        check();
      }, ms);
      this.timers.add(t);
    };
    later(TASK_SETTLE);
  }

  /** Checked and accepted: it settles, and leaves the list after a moment. */
  private accept(jobId: string): void {
    this.history.settle(jobId);
    this.patch(jobId, { checked: true, checkedAt: new Date().toISOString() });
    const done = this.jobs.find((j) => j.id === jobId);
    if (done) logTimings(done);
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
        void this.bridge?.postJob({ id: jobId, changeSet: job.changeSet, status: "queued", agent: job.agent, attempt: 2, differences, issues, session: job.session });
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

  // Stuck jobs

  /** What's stuck now, once it has lasted (see Stuck), or null. */
  get stuck(): Stuck | null {
    const now = this.stuckNow();
    if (!now || this.stuckSince?.kind !== now.kind) return null;
    // Once said, it stays until it's solved (cancelling the stuck jobs doesn't make the agent listen).
    return this.stuckSince.shown || Date.now() - this.stuckSince.at >= stuckAfter(now) ? now : null;
  }

  /** Whether `job` is one of the stuck ones (see stuck). */
  isStuck(job: JobRecord): boolean {
    return !!this.stuck?.jobs.includes(job.id);
  }

  private stuckSince: { kind: Stuck["kind"]; at: number; shown?: boolean } | null = null;
  private stuckTimer: ReturnType<typeof setTimeout> | undefined;
  private quietTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * What would be stuck right now, before it has lasted. Only jobs waiting
   * for a run or in one count (not one being checked, nor one whose
   * question waits for the designer: that's the designer's turn):
   * - agent-error: Pilot couldn't run the agent for a job (not installed,
   *   not signed in, the run failed): said at once, with what to do, until
   *   the designer sends again or takes it back;
   * - older-agent: the page can't reach the hub, and an older Pilot's hub
   *   answers on its port (an agent's chat on the MCP loop, or an older
   *   `npx usepilot`): it can't reach this page, said with jobs or without
   *   (BridgeClient's olderHub);
   * - offline: the page can't reach the hub (`npx usepilot` isn't running);
   * - no-agent: it can, but Pilot doesn't run for this site (it's running
   *   for another project).
   * Pilot not running is said with jobs or without: there's no other way to
   * hand changes over (Copy prompt is gone), so whatever goes next can't go.
   */
  private stuckNow(): Stuck | null {
    if (!this.bridge) return null;
    const open = this.jobs.filter((j) => j.status === "queued" || j.status === "working");
    const { connected, agents, older } = this.state;
    const notRunning = `Pilot isn't running for ${this.project ?? "this site"}`;
    const ids = (jobs: JobRecord[]) => jobs.map((j) => j.id);
    if (!connected && older) {
      return { kind: "older-agent", title: notRunning, detail: NOT_RUNNING_OLDER, jobs: ids(open) };
    }
    // A page whose loader doesn't name its project: `npx usepilot` can't tell it's this project's (see mountPilot's `project`).
    const detail = this.project ? NOT_RUNNING : NOT_NAMED;
    if (!connected) return { kind: "offline", title: notRunning, detail, jobs: ids(open) };
    if (!agents.length) return { kind: "no-agent", title: notRunning, detail, jobs: ids(open) };
    // A run that has gone quiet (its agent's service stalled): said instead of a loader spinning for ever.
    const quiet = this.quietJobs();
    if (quiet.length) {
      const name = quiet[0]?.agent?.label?.split(" · ")[0] || "The agent";
      return { kind: "quiet", title: `${name} has gone quiet`, detail: QUIET_DETAIL, jobs: ids(quiet) };
    }
    // A run that failed: said after Pilot not running, which stops every job (an earlier failure
    // mustn't hide it: the jobs still open would spin with nothing said). Its thread says it either way.
    const failed = this.jobs.filter((j) => j.error && j.status === "done");
    const last = failed.at(-1)?.error;
    if (last) return { kind: "agent-error", title: last.title, detail: last.detail, jobs: failed.map((j) => j.id) };
    return null;
  }

  /** The runs whose agent hasn't shown any work for QUIET_MS (only those that report it: Job.activeAt). */
  private quietJobs(now = Date.now()): JobRecord[] {
    return this.jobs.filter((j) => j.status === "working" && j.activeAt && now - Date.parse(j.activeAt) >= QUIET_MS);
  }

  /** Keeps `stuckSince` in step, and tells the listeners when a stuck state has lasted long enough to show. */
  private watchStuck(): void {
    // A run going quiet is a matter of time: look again when the next one would be.
    clearTimeout(this.quietTimer);
    const next = Math.min(...this.jobs.filter((j) => j.status === "working" && j.activeAt).map((j) => Date.parse(j.activeAt as string) + QUIET_MS));
    if (Number.isFinite(next) && next > Date.now()) this.quietTimer = setTimeout(() => this.notify(), next - Date.now());
    const now = this.stuckNow();
    if (!now) {
      this.stuckSince = null;
      clearTimeout(this.stuckTimer);
      return;
    }
    if (this.stuckSince?.kind !== now.kind) this.stuckSince = { kind: now.kind, at: Date.now() };
    // Tell the listeners when it's due (again, as how long it takes can change: the last stuck job cancelled).
    clearTimeout(this.stuckTimer);
    const due = stuckAfter(now) - (Date.now() - this.stuckSince.at);
    if (due > 0 && !this.stuckSince.shown) this.stuckTimer = setTimeout(() => this.notify(), due);
    else this.stuckSince.shown = true;
  }

  private notify(): void {
    this.watchStuck();
    for (const listener of this.listeners) listener();
  }
}

/** The agent spoke last in the thread: it's the designer's turn (reply or resolve). */
export function needsYou(thread: CommentThread): boolean {
  const last = thread.messages.at(-1);
  return last?.from === "agent" && !last.stopped && !last.early;
}

/** How long a stuck state lasts before the page says so (see STUCK_OFFLINE_MS). */
function stuckAfter(stuck: Stuck): number {
  // A failed run is said at once; a quiet one has lasted already (QUIET_MS).
  return stuck.kind === "agent-error" || stuck.kind === "quiet" ? 0 : STUCK_OFFLINE_MS;
}

/** What to do about a run that has gone quiet. */
const QUIET_DETAIL = "No sign of work for 2 minutes. Click to stop it, then send again.";

/** What to do when Pilot isn't running for the site. */
const NOT_RUNNING = "Run npx usepilot in your project's folder";
const NOT_RUNNING_OLDER = "Run npx usepilot in your project's folder (an older Pilot is running, and can't reach this page)";
const NOT_NAMED = "Its loader doesn't say which project this is: ask your agent to run npx usepilot@latest update, then run npx usepilot";

/** Done, with a question for the designer not answered yet (see PilotSession.ask). */
export function awaitsAnswer(job: Pick<JobRecord, "status" | "question" | "answer" | "checked">): boolean {
  return job.status === "done" && !!job.question && !job.answer && !job.checked;
}

/** Not finished yet: waiting, an agent on it, being checked, or its follow-up (a run that failed is over: its changes are unsent again). */
function unfinished(job: JobRecord): boolean {
  return job.status !== "cancelled" && !job.checked && !job.error;
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

/**
 * Where a job's time went, in seconds: waiting for an agent (sent → taken),
 * the agent's work (taken → done), and Pilot's check (done → checked). Null
 * for a step that hasn't happened (yet). For a job with a follow-up, the
 * last attempt's steps, and the total from the first send.
 */
export function timings(job: Pick<JobRecord, "createdAt" | "takenAt" | "doneAt" | "checkedAt">): {
  waiting: number | null;
  agent: number | null;
  check: number | null;
  total: number | null;
} {
  const at = (iso?: string) => (iso ? Date.parse(iso) : Number.NaN);
  const span = (from?: string, to?: string) => {
    const s = (at(to) - at(from)) / 1000;
    return Number.isFinite(s) && s >= 0 ? Math.round(s * 10) / 10 : null;
  };
  return {
    waiting: span(job.createdAt, job.takenAt),
    agent: span(job.takenAt, job.doneAt),
    check: span(job.doneAt, job.checkedAt),
    total: span(job.createdAt, job.checkedAt),
  };
}

/** A finished job's timings, in the browser console: where the time went, to make jobs faster. */
function logTimings(job: JobRecord): void {
  const t = timings(job);
  if (t.total === null) return;
  const part = (label: string, s: number | null) => (s === null ? [] : [`${label} ${s}s`]);
  const parts = [...part("waiting for an agent", t.waiting), ...part("agent", t.agent), ...part("Pilot's check", t.check)];
  const attempt = (job.attempt ?? 1) > 1 ? " (with a follow-up)" : "";
  console.info(`[Pilot] Job done in ${t.total}s${attempt}: ${parts.join(", ")}.`);
}

/**
 * Each component's props, as the agent last listed them (`/props`), for the
 * tab: the next `/props` on it shows them at once, while the agent reads the
 * code again (see postComment). By name and file, so two components that
 * share a name stay apart.
 */
const PROPS_KEY = "pilot:props";

function propsKey(component: string, file: string | undefined): string {
  return `${component} ${file ?? ""}`;
}

function knownProps(component: string, file: string | undefined): PropSpec[] | null {
  try {
    const all = JSON.parse(sessionStorage.getItem(PROPS_KEY) ?? "{}") as Record<string, PropSpec[]>;
    return all[propsKey(component, file)] ?? null;
  } catch {
    return null;
  }
}

function rememberProps(component: string, file: string | undefined, props: PropSpec[]): void {
  try {
    const all = JSON.parse(sessionStorage.getItem(PROPS_KEY) ?? "{}") as Record<string, PropSpec[]>;
    all[propsKey(component, file)] = props;
    sessionStorage.setItem(PROPS_KEY, JSON.stringify(all));
  } catch {
    // Not remembered: the next `/props` waits for the agent's list.
  }
}

