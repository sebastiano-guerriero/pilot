import type { AgentInfo, AgentQuestion, Job, OpenPage, PropSpec, WidthCheck } from "@pilot/protocol";
import type { DoneExtra } from "./hub.ts";
import { BRIDGE_VERSION } from "@pilot/protocol";
import type { Hub, WaitResult } from "./hub.ts";
import { CHECK_TIMEOUT, localAgents, startHub, type HubServer } from "./server.ts";

/**
 * A process's way to the hub (one per `npx usepilot`). The first process
 * on the machine runs the hub itself; the others reach it over HTTP. When the
 * hub's process ends (its terminal was closed), the next call fails to connect,
 * and this process takes over: it starts the hub on the same port (or joins
 * whoever got there first). Pages reconnect by themselves and post their
 * unfinished jobs again, so nothing is lost.
 */
export interface HubApi {
  register(agent: AgentInfo, origin: string): Promise<void>;
  launch(agent: AgentInfo, origin: string): Promise<number>;
  /** The sites with Pilot open in a browser (their origins). */
  pages(): Promise<OpenPage[]>;
  wait(agent: AgentInfo, origin: string, timeoutMs: number, signal?: AbortSignal): Promise<WaitResult>;
  done(agent: AgentInfo, jobId: string, notes?: string, question?: AgentQuestion, props?: PropSpec[], extra?: DoneExtra): Promise<Job | null>;
  /** A job as the hub has it (null: it doesn't know it). */
  job(agent: AgentInfo, jobId: string): Promise<Job | null>;
  /** The agent is at work on `jobId` (its output came). */
  activity(agent: AgentInfo, jobId: string): Promise<void>;
  check(agent: AgentInfo, jobId: string, timeoutMs: number): Promise<WidthCheck | null>;
  /** Whether the designer asked, from the page, to sign the agent in (taken: true once per ask). */
  setup(agent: AgentInfo): Promise<{ signIn: boolean }>;
  leave(agent: AgentInfo): Promise<void>;
}

/** The hub in this process. */
class LocalApi implements HubApi {
  constructor(private hub: Hub) {}
  async register(agent: AgentInfo, origin: string) {
    localAgents.add(agent.id);
    this.hub.register(agent, origin);
  }
  async launch(agent: AgentInfo, origin: string) {
    localAgents.add(agent.id);
    return this.hub.launch(agent, origin);
  }
  async pages() {
    return this.hub.openPages();
  }
  wait(agent: AgentInfo, origin: string, timeoutMs: number, signal?: AbortSignal) {
    localAgents.add(agent.id);
    return this.hub.wait(agent, origin, timeoutMs, signal);
  }
  async done(agent: AgentInfo, jobId: string, notes?: string, question?: AgentQuestion, props?: PropSpec[], extra?: DoneExtra) {
    return this.hub.done(agent.id, jobId, notes, question, props, extra);
  }
  async job(_agent: AgentInfo, jobId: string) {
    return this.hub.job(jobId) ?? null;
  }
  async activity(agent: AgentInfo, jobId: string) {
    this.hub.activity(agent.id, jobId);
  }
  check(_agent: AgentInfo, jobId: string, timeoutMs: number) {
    return this.hub.check(jobId, timeoutMs);
  }
  async setup(agent: AgentInfo) {
    return { signIn: this.hub.takeSignIn(agent.id) };
  }
  async leave(agent: AgentInfo) {
    localAgents.delete(agent.id);
    this.hub.unregister(agent.id);
  }
}

/** The hub in another `npx usepilot` process, over HTTP. */
class RemoteApi implements HubApi {
  constructor(private port: number) {}
  private async post<T>(action: string, data: object, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`http://127.0.0.1:${this.port}/agents/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      signal,
    });
    if (!res.ok) throw new Error(`Pilot bridge: ${action} failed (${res.status})`);
    return (await res.json()) as T;
  }
  async register(agent: AgentInfo, origin: string) {
    await this.post("register", { agent, origin });
  }
  async launch(agent: AgentInfo, origin: string) {
    return (await this.post<{ pages: number }>("launch", { agent, origin })).pages;
  }
  async pages() {
    // A hub from before this route (same bridge version): it can't say.
    try {
      return (await this.post<{ pages?: OpenPage[] }>("pages", {})).pages ?? [];
    } catch (error) {
      if (isConnectionError(error)) throw error;
      return [];
    }
  }
  wait(agent: AgentInfo, origin: string, timeoutMs: number, signal?: AbortSignal) {
    return this.post<WaitResult>("wait", { agent, origin, timeoutMs }, signal);
  }
  async done(agent: AgentInfo, jobId: string, notes?: string, question?: AgentQuestion, props?: PropSpec[], extra?: DoneExtra) {
    return (await this.post<{ job: Job | null }>("done", { agent, jobId, notes, question, props, ...extra })).job;
  }
  async job(agent: AgentInfo, jobId: string) {
    return (await this.post<{ job: Job | null }>("job", { agent, jobId })).job;
  }
  async activity(agent: AgentInfo, jobId: string) {
    // A hub from before this route (same bridge version): it can't say, and its pages never call a run quiet.
    try {
      await this.post("activity", { agent, jobId });
    } catch (error) {
      if (isConnectionError(error)) throw error;
    }
  }
  async check(agent: AgentInfo, jobId: string, timeoutMs: number) {
    return (await this.post<{ check: WidthCheck | null }>("check", { agent, jobId, timeoutMs })).check;
  }
  async setup(agent: AgentInfo) {
    return { signIn: !!(await this.post<{ signIn?: boolean }>("setup", { agent })).signIn };
  }
  async leave(agent: AgentInfo) {
    await this.post("leave", { agent });
  }
}

/** How often a remote agent tells the hub it's still there (see AGENT_TTL). */
const HEARTBEAT = 10_000;

export class Bridge {
  private api: HubApi | null = null;
  private server: HubServer | null = null;
  private connecting: Promise<HubApi> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** The origin this agent works on, once it launched: re-registered after a takeover. */
  private origin: string | null = null;

  constructor(
    readonly agent: AgentInfo,
    readonly port: number,
  ) {}

  /** Whether this process runs the hub. */
  get isHub(): boolean {
    return !!this.server;
  }

  async launch(origin: string): Promise<number> {
    this.origin = origin;
    const pages = await this.call((api) => api.launch(this.agent, origin));
    this.startHeartbeat();
    return pages;
  }

  /** The sites with Pilot open in a browser (their origins). */
  pages(): Promise<OpenPage[]> {
    return this.call((api) => api.pages());
  }

  /** Tells the hub how the agent stands now (its `setup` changed): the pages show it at once. */
  async register(): Promise<void> {
    if (!this.origin) return;
    const origin = this.origin;
    await this.call((api) => api.register(this.agent, origin));
  }

  /** Whether the designer asked, from the page, to sign the agent in (see Hub.requestSignIn). */
  async signInAsked(): Promise<boolean> {
    return (await this.call((api) => api.setup(this.agent))).signIn;
  }

  /** Waits up to `timeoutMs` for a job; survives the hub moving to another process mid-wait. */
  async wait(origin: string, timeoutMs: number, signal?: AbortSignal): Promise<WaitResult> {
    this.origin = origin;
    const until = Date.now() + timeoutMs;
    for (;;) {
      try {
        const api = await this.connect();
        return await api.wait(this.agent, origin, Math.max(0, until - Date.now()), signal);
      } catch (error) {
        if (signal?.aborted) return { job: null };
        if (!isConnectionError(error) || Date.now() >= until) throw error;
        this.reset();
      }
    }
  }

  done(jobId: string, notes?: string, question?: AgentQuestion, props?: PropSpec[], extra?: DoneExtra): Promise<Job | null> {
    return this.call((api) => api.done(this.agent, jobId, notes, question, props, extra));
  }

  /** A job as the hub has it now (null: it doesn't know it). */
  job(jobId: string): Promise<Job | null> {
    return this.call((api) => api.job(this.agent, jobId));
  }

  /** The agent is at work on `jobId`: its output came (see Job.activeAt). */
  activity(jobId: string): Promise<void> {
    return this.call((api) => api.activity(this.agent, jobId));
  }

  /** Pilot's width check of a task's element, measured by the page (null: no page answered). */
  check(jobId: string, timeoutMs = CHECK_TIMEOUT): Promise<WidthCheck | null> {
    return this.call((api) => api.check(this.agent, jobId, timeoutMs));
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    try {
      await this.api?.leave(this.agent);
    } catch {
      // The hub is already gone.
    }
    await this.server?.close();
    this.server = null;
    this.api = null;
  }

  /** Runs `fn` against the hub, reconnecting (or taking over) once if it went away. */
  private async call<T>(fn: (api: HubApi) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.connect());
    } catch (error) {
      if (!isConnectionError(error)) throw error;
      this.reset();
      return fn(await this.connect());
    }
  }

  private connect(): Promise<HubApi> {
    if (this.api) return Promise.resolve(this.api);
    this.connecting ??= this.elect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  /** Runs the hub here, or joins the one already on the port. */
  private async elect(): Promise<HubApi> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        this.server = await startHub(this.port);
        this.api = new LocalApi(this.server.hub);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
        const health = await checkHealth(this.port);
        if (!health) {
          // Its process is closing: try again in a moment.
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        if (!health.pilot) throw new Error(`Port ${this.port} is used by another program. Set PILOT_PORT to use another port.`);
        if (health.version !== BRIDGE_VERSION) {
          throw new Error(
            `Another Pilot version (bridge ${health.version}) runs on port ${this.port}. Each version has its own port, so this one was set by hand (PILOT_PORT): unset it, or use the same Pilot version everywhere.`,
          );
        }
        this.api = new RemoteApi(this.port);
      }
      if (this.origin) await this.api.register(this.agent, this.origin);
      return this.api;
    }
    throw new Error(`Pilot bridge: couldn't start or reach the hub on port ${this.port}.`);
  }

  private reset(): void {
    this.api = null;
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      if (!this.origin || this.server) return;
      this.call((api) => api.register(this.agent, this.origin as string)).catch(() => {});
    }, HEARTBEAT);
    this.heartbeat.unref();
  }
}

/** What's on the port: Pilot's hub (and its version), something else (`{}`), or nothing answering (null). */
async function checkHealth(port: number): Promise<{ pilot?: boolean; version?: number } | null> {
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/health`);
  } catch {
    return null;
  }
  try {
    return (await res.json()) as { pilot?: boolean; version?: number };
  } catch {
    return {};
  }
}

function isConnectionError(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string }; message?: string };
  const code = e?.code ?? e?.cause?.code;
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "UND_ERR_SOCKET" ||
    /fetch failed|socket hang up|other side closed/i.test(e?.message ?? "")
  );
}
