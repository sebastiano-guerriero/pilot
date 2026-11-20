import { randomUUID } from "node:crypto";
import type { AgentInfo, AgentQuestion, ChangeResult, ChangeSet, Job, PageEvent, PropSpec, WidthCheck } from "@pilot/protocol";
import { originKey } from "@pilot/protocol";

/**
 * The hub's state: agents, the pages connected to it, and the jobs between
 * them, filed by page origin (see originKey). In memory only: the page keeps
 * its own jobs and posts its unfinished ones again whenever it connects, so a
 * new hub (after the old one's process ended) picks up where it left off.
 *
 * The HTTP server around it is in server.ts; agents in the same process call
 * it directly (agent.ts).
 */

/** An agent not heard from for this long is gone (a remote one pings every few seconds). */
export const AGENT_TTL = 30_000;

/** How the hub talks to one connected page. */
export interface PageConnection {
  origin: string;
  send(event: PageEvent): void;
}

/** What a page posts for a job: its id and change set, and where it stands as the page knows it. */
export interface JobPost {
  id: string;
  changeSet: ChangeSet;
  status?: Job["status"];
  agent?: AgentInfo;
  /** A follow-up the page posts again (see Hub.retry). */
  attempt?: number;
  differences?: ChangeResult[];
  issues?: string[];
  /** An answered question (see Hub.answer), posted again. */
  question?: AgentQuestion;
  answer?: string;
}

/** What `wait` returns: the job taken, or none (timed out). */
export interface WaitResult {
  job: Job | null;
  /** The designer quit Pilot on the site: stop the loop (no more waits) until /pilot again. */
  quit?: boolean;
}

interface Agent {
  /** As pages may see it: without its folder. */
  info: AgentInfo;
  origin: string;
  seen: number;
  folder?: string;
}

interface Waiter {
  agentId: string;
  origin: string;
  resolve(job: Job | null, quit?: boolean): void;
}

/** A width check an agent asked for, waiting for the page's answer. */
interface PendingCheck {
  origin: string;
  resolve(check: WidthCheck | null): void;
}

export class Hub {
  private agents = new Map<string, Agent>();
  private pages = new Set<PageConnection>();
  /** Sites the designer quit Pilot on: their agents' waits end at once, until one runs /pilot there again. */
  private quitOrigins = new Set<string>();
  private jobs = new Map<string, Job>();
  private waiters: Waiter[] = [];
  private checks = new Map<string, PendingCheck>();

  constructor(private now: () => number = Date.now) {}

  // Agents

  /** An agent works on pages of `origin` (again: also how a remote one says it's alive). */
  register(info: AgentInfo, origin: string): void {
    const key = originKey(origin);
    const known = this.agents.get(info.id);
    const { folder, ...shown } = info;
    this.agents.set(info.id, { info: shown, origin: key, seen: this.now(), folder: folder ?? known?.folder });
    if (!known || known.origin !== key) {
      if (known) this.notifyAgents(known.origin);
      this.notifyAgents(key);
    }
  }

  /**
   * The agent is gone (its process ended or it stopped pinging): its waits
   * end, and the jobs it was working on go back to the queue, for another
   * chat (or this one, back), instead of staying "working" for nobody.
   */
  unregister(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.agents.delete(agentId);
    for (const w of this.waiters.filter((w) => w.agentId === agentId)) this.endWait(w, null);
    for (const job of this.jobs.values()) {
      if (job.status === "working" && job.agent?.id === agentId) this.update(job, { status: "queued", takenAt: undefined });
    }
    this.notifyAgents(agent.origin);
    this.dispatch(agent.origin);
  }

  /** An agent's info as pages see it (no folder). */
  private shown(info: AgentInfo): AgentInfo {
    return this.agents.get(info.id)?.info ?? { id: info.id, label: info.label };
  }

  /** The project folders of the agents working on pages of `origin`: where its components are read from. */
  folders(origin: string): string[] {
    const key = originKey(origin);
    return [...new Set([...this.agents.values()].filter((a) => a.origin === key && a.folder).map((a) => a.folder as string))];
  }

  /** Drops agents not heard from in AGENT_TTL (`keep`: the ones in this process, always alive). */
  sweep(keep: Set<string> = new Set()): void {
    const cutoff = this.now() - AGENT_TTL;
    for (const [id, agent] of this.agents) {
      if (!keep.has(id) && agent.seen < cutoff && !this.waiters.some((w) => w.agentId === id)) this.unregister(id);
    }
  }

  /**
   * The designer quit Pilot on `origin` (the whole site): its agents' waits
   * end with `quit`, so their chats stop the loop and are theirs again, and
   * so do their next waits (an agent on a job finishes it first) until one
   * runs /pilot there again; its open pages close Pilot. Jobs aren't touched
   * here: the page takes back the ones still queued.
   */
  quit(origin: string): void {
    const key = originKey(origin);
    this.quitOrigins.add(key);
    for (const waiter of this.waiters.filter((w) => w.origin === key)) {
      this.waiters = this.waiters.filter((w) => w !== waiter);
      waiter.resolve(null, true);
    }
    this.sendTo(key, { type: "quit" });
    this.notifyAgents(key);
  }

  /**
   * The sites with Pilot open in a browser now (the origins of the connected
   * pages, each once): where /pilot can launch without being told a URL.
   */
  pageOrigins(): string[] {
    return [...new Set([...this.pages].map((p) => p.origin))];
  }

  /** An agent ran /pilot: registers it and tells the open pages of `origin` to launch Pilot. Returns how many pages got it. */
  launch(info: AgentInfo, origin: string): number {
    this.quitOrigins.delete(originKey(origin));
    this.register(info, origin);
    return this.sendTo(originKey(origin), { type: "launch", agent: this.shown(info) });
  }

  /**
   * The agent's next job for its origin: the oldest queued one right away, or
   * the next one posted within `timeoutMs` (null after that, or when `signal`
   * aborts). Taking a job marks it working, by this agent.
   */
  wait(info: AgentInfo, origin: string, timeoutMs: number, signal?: AbortSignal): Promise<WaitResult> {
    this.register(info, origin);
    const key = originKey(origin);
    // Quit there: the agent stops (it finished what it was on).
    if (this.quitOrigins.has(key)) return Promise.resolve({ job: null, quit: true });
    const queued = this.oldestQueued(key);
    if (queued) return Promise.resolve({ job: this.take(queued, this.shown(info)) });
    return new Promise((resolve) => {
      const waiter: Waiter = {
        agentId: info.id,
        origin: key,
        resolve: (job, quit) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          resolve(quit ? { job: null, quit: true } : { job });
        },
      };
      const timer = setTimeout(() => this.endWait(waiter, null), timeoutMs);
      const onAbort = () => this.endWait(waiter, null);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiters.push(waiter);
      this.notifyAgents(key);
    });
  }

  /**
   * The agent applied a job: done, with its notes, and its `question` for
   * the designer if it asked one (the page shows it and holds the job until
   * the answer, see answer). A job asks once: a question on an answered job
   * is dropped. Null for a job the hub doesn't know.
   */
  done(agentId: string, jobId: string, notes?: string, question?: AgentQuestion, props?: PropSpec[]): Job | null {
    const job = this.jobs.get(jobId);
    if (!job || job.status === "cancelled") return null;
    const agent = this.agents.get(agentId)?.info ?? job.agent;
    const asks = question && !job.answer ? { question } : {};
    // A `/props` job's answer: the component's props, for the page to show.
    const listed = props?.length && job.changeSet.request?.kind === "props" ? { props } : {};
    this.update(job, {
      status: "done",
      agent,
      notes: notes?.trim() || undefined,
      doneAt: new Date(this.now()).toISOString(),
      ...asks,
      ...listed,
    });
    return job;
  }

  /**
   * The designer answered a done job's question: the job goes back to the
   * queue with the answer, preferably to the agent that asked. Null when it
   * can't (not done, no question, or answered already).
   */
  answer(origin: string, jobId: string, answer: string): Job | null {
    const job = this.jobs.get(jobId);
    if (!job || job.origin !== originKey(origin) || job.status !== "done" || !job.question || job.answer) return null;
    this.update(job, { status: "queued", answer, notes: undefined });
    this.dispatch(job.origin);
    return job;
  }

  /**
   * An agent asks for Pilot's width check of a task's element: the open
   * pages of the job's origin get a `check` event, and the one that has the
   * job measures it and posts the answer (checkResult). Null when no page
   * is open, the hub doesn't know the job, or no answer comes in `timeoutMs`.
   */
  check(jobId: string, timeoutMs: number): Promise<WidthCheck | null> {
    const job = this.jobs.get(jobId);
    if (!job) return Promise.resolve(null);
    const requestId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(null), timeoutMs);
      const finish = (check: WidthCheck | null) => {
        clearTimeout(timer);
        this.checks.delete(requestId);
        resolve(check);
      };
      this.checks.set(requestId, { origin: job.origin, resolve: finish });
      if (!this.sendTo(job.origin, { type: "check", requestId, jobId })) finish(null);
    });
  }

  /** A page's answer to a width check: false when nothing waits for it from that origin. */
  checkResult(origin: string, requestId: string, check: WidthCheck): boolean {
    const pending = this.checks.get(requestId);
    if (!pending || pending.origin !== originKey(origin)) return false;
    pending.resolve(check);
    return true;
  }

  // Pages

  addPage(page: PageConnection): () => void {
    const conn = { ...page, origin: originKey(page.origin) };
    this.pages.add(conn);
    conn.send(this.agentsEvent(conn.origin));
    for (const job of this.jobs.values()) {
      if (job.origin === conn.origin) conn.send({ type: "job", job: structuredClone(job) });
    }
    return () => this.pages.delete(conn);
  }

  /** Whether any agent works on pages of `origin`: only then does the hub take jobs from it. */
  hasAgents(origin: string): boolean {
    const key = originKey(origin);
    return [...this.agents.values()].some((a) => a.origin === key);
  }

  /**
   * A job from a page: new ones are queued (and go to a waiting agent);
   * posting one the hub already has changes nothing, so a page can post its
   * unfinished jobs again whenever it connects. One the page knows as working,
   * by an agent still here, stays that agent's.
   */
  postJob(origin: string, post: JobPost): Job {
    const key = originKey(origin);
    const known = this.jobs.get(post.id);
    if (known) return known;
    const at = new Date(this.now()).toISOString();
    const stillWorking = post.status === "working" && post.agent && this.agents.has(post.agent.id);
    const job: Job = {
      id: post.id,
      origin: key,
      changeSet: post.changeSet,
      status: stillWorking ? "working" : "queued",
      // A follow-up (or an answered question) keeps its agent as the one to prefer (see dispatch).
      agent: stillWorking || post.attempt === 2 || post.answer ? post.agent : undefined,
      attempt: post.attempt ?? 1,
      differences: post.differences,
      issues: post.issues,
      question: post.question,
      answer: post.answer,
      createdAt: at,
      updatedAt: at,
    };
    this.jobs.set(job.id, job);
    this.sendTo(key, { type: "job", job });
    if (job.status === "queued") this.dispatch(key);
    return job;
  }

  /** The designer took a job back before it was done. */
  cancel(origin: string, jobId: string): Job | null {
    const job = this.jobs.get(jobId);
    if (!job || job.origin !== originKey(origin) || job.status === "done") return null;
    this.update(job, { status: "cancelled" });
    return job;
  }

  /**
   * Some changes of a done job didn't come out as the designer set them (or
   * a task's width check found problems, `issues`): the job goes back to
   * the queue once, as a follow-up with the `differences`,
   * preferably to the agent that did it. Null when it can't (not done, or
   * already a follow-up: then the page takes what the code gives).
   */
  retry(origin: string, jobId: string, differences: ChangeResult[], issues?: string[]): Job | null {
    const job = this.jobs.get(jobId);
    if (!job || job.origin !== originKey(origin) || job.status !== "done" || (job.attempt ?? 1) >= 2) return null;
    this.update(job, { status: "queued", attempt: 2, differences, issues, notes: undefined });
    this.dispatch(job.origin);
    return job;
  }

  job(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  // Internals

  private oldestQueued(origin: string): Job | undefined {
    return [...this.jobs.values()]
      .filter((j) => j.origin === origin && j.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  }

  private take(job: Job, agent: AgentInfo): Job {
    this.update(job, { status: "working", agent, takenAt: new Date(this.now()).toISOString() });
    return job;
  }

  /**
   * Gives the oldest queued job of `origin` to the agent waiting longest
   * there; a follow-up to the agent that did the job, if it's waiting.
   */
  private dispatch(origin: string): void {
    const job = this.oldestQueued(origin);
    const waiters = this.waiters.filter((w) => w.origin === origin);
    const waiter = waiters.find((w) => w.agentId === job?.agent?.id) ?? waiters[0];
    const agent = waiter && this.agents.get(waiter.agentId);
    if (!waiter || !job || !agent) return;
    this.endWait(waiter, this.take(job, agent.info));
  }

  private endWait(waiter: Waiter, job: Job | null): void {
    const i = this.waiters.indexOf(waiter);
    if (i < 0) return;
    this.waiters.splice(i, 1);
    waiter.resolve(job);
    this.notifyAgents(waiter.origin);
  }

  private update(job: Job, patch: Partial<Job>): void {
    Object.assign(job, patch, { updatedAt: new Date(this.now()).toISOString() });
    this.sendTo(job.origin, { type: "job", job });
  }

  private agentsEvent(origin: string): PageEvent {
    const agents = [...this.agents.values()].filter((a) => a.origin === origin).map((a) => a.info);
    const waiting = new Set(this.waiters.filter((w) => w.origin === origin).map((w) => w.agentId)).size;
    return { type: "agents", agents, waiting };
  }

  private notifyAgents(origin: string): void {
    this.sendTo(origin, this.agentsEvent(origin));
  }

  private sendTo(origin: string, event: PageEvent): number {
    let n = 0;
    for (const page of this.pages) {
      if (page.origin !== origin) continue;
      // A copy: the hub keeps changing its jobs, an event says how one was then.
      page.send(structuredClone(event));
      n++;
    }
    return n;
  }
}
