import type { AgentInfo, ChangeResult, Job, PageEvent, WidthCheck } from "@pilot/protocol";
import { DEFAULT_BRIDGE_PORT } from "@pilot/protocol";

/** Where the hub listens (see packages/cli: `pilot mcp`). */
export const DEFAULT_BRIDGE_URL = `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;

/** What the page knows of the bridge. */
export interface BridgeState {
  /** Connected to the hub. */
  connected: boolean;
  /** The agents working on this page (they ran /pilot for it). */
  agents: AgentInfo[];
  /** How many of them are waiting for a job right now. */
  waiting: number;
}

export interface BridgeHandlers {
  /** An agent ran /pilot for this page. */
  onLaunch(agent: AgentInfo): void;
  /** A job changed on the hub. */
  onJob(job: Job): void;
  /** Connected (again): the page posts its unfinished jobs, in case the hub is new. */
  onConnect(): void;
  /** An agent works on this page now (on connect, or the first one arriving). */
  onAgentsArrived?(): void;
  /** An agent asks for a width check of a job's element (answered with postCheck). */
  onCheck?(requestId: string, jobId: string): void;
}

/**
 * Waits between reconnect attempts while the hub isn't there: from 2s, up to
 * 5s. Short, because /pilot in the agent should open Pilot right away; each
 * attempt is one refused request on localhost.
 */
const BACKOFF = [2_000, 3_000, 5_000];

/**
 * The page's connection to the hub: Server-Sent Events in (agents, launch,
 * job updates), HTTP posts out (jobs, cancels, results). The hub runs only
 * while an agent's `pilot mcp` does, so the page keeps trying to reach it,
 * every few seconds.
 */
export class BridgeClient {
  state: BridgeState = { connected: false, agents: [], waiting: 0 };
  private source: EventSource | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private listeners = new Set<() => void>();
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly handlers: BridgeHandlers,
    private readonly EventSourceImpl: typeof EventSource | undefined = globalThis.EventSource,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.source?.close();
    this.source = null;
    if (this.reconnect) clearTimeout(this.reconnect);
    this.setState({ connected: false, agents: [], waiting: 0 });
  }

  /** Posts a job. False when the hub isn't reachable or refused it (no agent on this page). */
  postJob(job: Pick<Job, "id" | "changeSet" | "status" | "agent" | "attempt" | "differences" | "issues">): Promise<boolean> {
    return this.post("/jobs", job);
  }

  /** The answer to a width check the agent asked for. */
  postCheck(requestId: string, check: WidthCheck): Promise<boolean> {
    return this.post(`/checks/${encodeURIComponent(requestId)}`, { check });
  }

  cancel(jobId: string): Promise<boolean> {
    return this.post(`/jobs/${encodeURIComponent(jobId)}/cancel`, {});
  }

  /**
   * Sends a done job back once, as a follow-up with what didn't come out
   * right: the changes that differ, or a task's problems (`issues`). False
   * when the hub refused.
   */
  retry(jobId: string, differences: ChangeResult[], issues?: string[]): Promise<boolean> {
    return this.post(`/jobs/${encodeURIComponent(jobId)}/retry`, { differences, issues });
  }

  private async post(path: string, body: object): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private open(): void {
    if (this.stopped || !this.EventSourceImpl) return;
    // EventSource retries by itself on a drop, but gives up on a refused
    // connection in some browsers: reconnect by hand, with a backoff.
    const source = new this.EventSourceImpl(`${this.url}/events`);
    this.source = source;
    source.onmessage = (e) => {
      let event: PageEvent;
      try {
        event = JSON.parse(e.data) as PageEvent;
      } catch {
        return;
      }
      this.receive(event);
    };
    source.onerror = () => {
      if (source.readyState === source.OPEN || this.stopped) return;
      source.close();
      if (this.source === source) this.source = null;
      const wasConnected = this.state.connected;
      this.setState({ connected: false, agents: [], waiting: 0 });
      const wait = BACKOFF[Math.min(this.failures, BACKOFF.length - 1)] as number;
      this.failures = wasConnected ? 0 : this.failures + 1;
      this.reconnect = setTimeout(() => this.open(), wasConnected ? 500 : wait);
    };
  }

  private receive(event: PageEvent): void {
    switch (event.type) {
      case "agents": {
        // Just connected, or the first agent arrived (the hub refuses jobs
        // from a page no agent works on): time to post the unfinished jobs.
        const arrived = !this.state.connected || (this.state.agents.length === 0 && event.agents.length > 0);
        this.failures = 0;
        this.setState({ connected: true, agents: event.agents, waiting: event.waiting });
        if (arrived) this.handlers.onConnect();
        if (arrived && event.agents.length > 0) this.handlers.onAgentsArrived?.();
        break;
      }
      case "launch":
        this.handlers.onLaunch(event.agent);
        break;
      case "job":
        this.handlers.onJob(event.job);
        break;
      case "check":
        this.handlers.onCheck?.(event.requestId, event.jobId);
        break;
    }
  }

  private setState(next: BridgeState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
