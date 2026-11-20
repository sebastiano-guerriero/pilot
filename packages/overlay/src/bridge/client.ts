import type { AgentInfo, ChangeResult, FileToken, Job, PageEvent, ProjectComponent, WidthCheck } from "@pilot/protocol";
import { BRIDGE_VERSION, DEFAULT_BRIDGE_PORT } from "@pilot/protocol";

/** Where the hub listens (see packages/cli: `pilot mcp`). */
export const DEFAULT_BRIDGE_URL = `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;

/** What the page knows of the bridge. */
export interface BridgeState {
  /** Connected to the hub. */
  connected: boolean;
  /** Pilot running for this page's site (`npx usepilot` registers it as its agent). */
  agents: AgentInfo[];
  /** How many of them are waiting for a job right now. */
  waiting: number;
  /**
   * Not connected, but an older Pilot's hub answers on its port (each bridge
   * version has its own): the bridge version found. An agent runs an older
   * Pilot, and /pilot there can't reach this page (see olderHub).
   */
  older?: number;
}

/** How often the page looks for an older Pilot's hub while it can't reach its own, at most. */
const OLDER_PROBE_MS = 10_000;

/**
 * The bridge version of an older Pilot's hub listening on this machine
 * (newest first), or null. Each version's hub has its port (4747 +
 * version), so a page and an agent on different versions never meet: an
 * agent's server kept at an old version (a bare `npx usepilot` keeps its
 * first download) left /pilot doing nothing, with no clue why. A request
 * that can't be read (no-cors): it only says something answers there.
 */
export async function olderHub(fetchImpl: typeof fetch = globalThis.fetch): Promise<number | null> {
  if (typeof fetchImpl !== "function") return null;
  for (let version = BRIDGE_VERSION - 1; version >= 1; version--) {
    try {
      const signal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(800) : undefined;
      await fetchImpl(`http://127.0.0.1:${4747 + version}/`, { mode: "no-cors", signal });
      return version;
    } catch {
      // Nothing there.
    }
  }
  return null;
}

export interface BridgeHandlers {
  /** Pilot started running for this page's site. */
  onLaunch(agent: AgentInfo): void;
  /** A job changed on the hub. */
  onJob(job: Job): void;
  /** Connected (again): the page posts its unfinished jobs, in case the hub is new. */
  onConnect(): void;
  /** An agent works on this page now (on connect, or the first one arriving). */
  onAgentsArrived?(): void;
  /** An agent asks for a width check of a job's element (answered with postCheck). */
  onCheck?(requestId: string, jobId: string): void;
  /** The designer quit Pilot on this site, here or in another tab: close it. */
  onQuit?(): void;
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
  private probedAt = 0;
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
  /**
   * Uploads a file for a comment (an image, text file or PDF, as `type`);
   * its id (the hub keeps the file in the OS temp folder), or null when the
   * hub refused it or isn't there.
   */
  async upload(file: Blob, type: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.url}/attachments`, { method: "POST", headers: { "content-type": type }, body: file });
      if (!res.ok) return null;
      const { id } = (await res.json()) as { id?: unknown };
      return typeof id === "string" ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * The project's components, as the agents' server reads them from the
   * code (for the `@` list); none when the hub isn't there, has no agent for
   * this page, or is older than this route.
   */
  async components(): Promise<ProjectComponent[]> {
    try {
      const res = await fetch(`${this.url}/components`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!res.ok) return [];
      const { components } = (await res.json()) as { components?: unknown };
      return Array.isArray(components)
        ? components.filter((c): c is ProjectComponent => typeof c?.name === "string" && typeof c?.file === "string")
        : [];
    } catch {
      return [];
    }
  }

  /** The project's tokens that only live in files (Pilot's server reads them); none when the hub can't say (as for components). */
  async tokens(): Promise<FileToken[]> {
    try {
      const res = await fetch(`${this.url}/tokens`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!res.ok) return [];
      const { tokens } = (await res.json()) as { tokens?: unknown };
      return Array.isArray(tokens)
        ? tokens.filter((t): t is FileToken => typeof t?.name === "string" && typeof t?.value === "string" && typeof t?.file === "string")
        : [];
    } catch {
      return [];
    }
  }

  postJob(job: Pick<Job, "id" | "changeSet" | "status" | "agent" | "attempt" | "differences" | "issues" | "question" | "answer" | "session">): Promise<boolean> {
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

  /** The designer's answer to the agent's question about a done job: it goes back to the agent with it. False when the hub refused. */
  answer(jobId: string, answer: string): Promise<boolean> {
    return this.post(`/jobs/${encodeURIComponent(jobId)}/answer`, { answer });
  }

  /** The designer closed Pilot on this site: its other pages close it too (false: no hub to tell). */
  quit(): Promise<boolean> {
    return this.post("/quit", {});
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
      this.setState({ connected: false, agents: [], waiting: 0, older: this.state.older });
      this.lookForOlder();
      const wait = BACKOFF[Math.min(this.failures, BACKOFF.length - 1)] as number;
      this.failures = wasConnected ? 0 : this.failures + 1;
      this.reconnect = setTimeout(() => this.open(), wasConnected ? 500 : wait);
    };
  }

  /** Its own hub not there: is an older Pilot's? Only on the default address (a custom one is the project's own setup). */
  private lookForOlder(): void {
    if (this.url !== DEFAULT_BRIDGE_URL || Date.now() - this.probedAt < OLDER_PROBE_MS) return;
    this.probedAt = Date.now();
    void olderHub().then((older) => {
      if (this.stopped || this.state.connected || (older ?? undefined) === this.state.older) return;
      this.setState({ ...this.state, older: older ?? undefined });
    });
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
      case "quit":
        this.handlers.onQuit?.();
        break;
    }
  }

  private setState(next: BridgeState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
