import type { AgentKind } from "./agents.ts";
import { type SavedSession, saveSessions, savedSessions } from "./config.ts";

/**
 * The agent's sessions kept for the editor's jobs (Send), per project: a job
 * resumes a free one instead of starting a new session, so the agent already
 * knows the guidelines and the project's code it read (a shorter prompt, fewer
 * steps). Jobs at once each take their own, so there are as many sessions as
 * jobs ever ran together. Saved with Pilot's settings (config.ts), so they're
 * found again when `npx usepilot` starts again. A session is retired after
 * MAX_JOBS jobs or MAX_AGE_MS, before its context makes the agent slower, and
 * dropped when resuming it fails. A session is never run twice at once: a
 * follow-up of a job waits for its session if another job has it.
 */

/** Jobs a session runs before it's retired: its context grows with each. */
export const MAX_JOBS = 20;
/** How old a session can be: the next day's work starts fresh. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface Lease {
  /** The session to resume; undefined: start a new one. */
  resume?: string;
  /** Done: the session the run ended with (the one resumed, or the new one), or undefined when it failed. */
  release(session: string | undefined): void;
}

export class SessionPool {
  private sessions: SavedSession[];
  private busy = new Set<string>();
  private waiters = new Map<string, Array<() => void>>();

  constructor(
    private readonly folder: string,
    private readonly agent: AgentKind,
    private readonly file?: string,
    private readonly now: () => number = Date.now,
  ) {
    this.sessions = this.fresh(savedSessions(folder, file).filter((s) => s.agent === agent));
  }

  /** The sessions still usable (not retired), for tests and the log. */
  get kept(): readonly SavedSession[] {
    return this.sessions;
  }

  /** A free session for a new job, else none (a new one starts). */
  take(): Lease {
    this.sessions = this.fresh(this.sessions);
    const free = this.sessions.find((s) => !this.busy.has(s.id));
    if (free) this.busy.add(free.id);
    return this.leaseOf(free?.id);
  }

  /** The session `id` for a follow-up of its job: when another job has it, once it's free. Not one of the pool's: just a lease on it. */
  async takeOwn(id: string): Promise<Lease> {
    while (this.busy.has(id)) await new Promise<void>((resolve) => this.waiters.set(id, [...(this.waiters.get(id) ?? []), resolve]));
    this.busy.add(id);
    return this.leaseOf(id);
  }

  private leaseOf(resume: string | undefined): Lease {
    let released = false;
    return {
      ...(resume ? { resume } : {}),
      release: (session) => {
        if (released) return;
        released = true;
        if (resume) this.free(resume);
        if (resume && session !== resume) this.sessions = this.sessions.filter((s) => s.id !== resume); // Resuming it failed: dropped.
        if (session) {
          const known = this.sessions.find((s) => s.id === session);
          if (known) known.jobs++;
          else this.sessions.push({ agent: this.agent, id: session, jobs: 1, since: this.now() });
        }
        this.sessions = this.fresh(this.sessions);
        this.save();
      },
    };
  }

  private free(id: string): void {
    this.busy.delete(id);
    const next = this.waiters.get(id)?.shift();
    if (next) next();
  }

  /** Without the retired ones. */
  private fresh(sessions: SavedSession[]): SavedSession[] {
    return sessions.filter((s) => s.jobs < MAX_JOBS && this.now() - s.since < MAX_AGE_MS);
  }

  private save(): void {
    try {
      // Another agent's sessions for this project stay as they are.
      const others = savedSessions(this.folder, this.file).filter((s) => s.agent !== this.agent);
      saveSessions(this.folder, [...others, ...this.sessions], this.file);
    } catch {
      // Settings not writable: the pool lasts while Pilot runs.
    }
  }
}
