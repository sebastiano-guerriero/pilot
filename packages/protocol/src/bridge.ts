/**
 * The bridge: how the page (Pilot's overlay) and coding agents meet.
 *
 * One hub per machine and bridge version listens on 127.0.0.1 (DEFAULT_BRIDGE_PORT). It lives
 * in the first `npx usepilot` process; later ones talk to it over HTTP and
 * take over if it goes away. The page sends jobs and listens to Server-Sent
 * Events; each project's process takes its site's jobs, runs the agent for
 * each, and reports them done. Jobs are routed by the page's origin: a
 * process gets jobs only from the site it runs for.
 */
import type { AgentSession, ChangeSet, PropSpec, PropValue } from "./types.ts";

/** Bumped when the hub's HTTP API changes incompatibly. 2: width checks (`/agents/check`, `/checks/:id`). 3: comment images (`/attachments`). 4: the agent's questions (`question` on `/agents/done`, `/jobs/:id/answer`). 5: the project's components (`/components`, the agent's `folder`) and `/props` (`props` on `/agents/done`). 6: the project's token files (`/tokens`, and what they stand for in the prompt: `fileTokens`). 7: Pilot runs the agent (`npx usepilot`): a job's agent `session` and `error`, `/agents/job`, and quit closes pages only. */
export const BRIDGE_VERSION = 7;

/**
 * The hub's port: one per bridge version (4747 + the version, so 4750 for
 * version 3). Projects on the same Pilot version share one hub, as they
 * should; a project on another version runs its own, instead of the two
 * blocking each other on one port. A project's page and its agent run the
 * same installed Pilot, so they always agree on the port. Pilots before
 * 0.7.0 all used 4747, which no version uses now.
 */
export const DEFAULT_BRIDGE_PORT = 4747 + BRIDGE_VERSION;

/**
 * - queued: sent by the designer, waiting for an agent;
 * - working: an agent took it;
 * - done: the agent reported it applied (`pilot_done`);
 * - cancelled: the designer took it back before it was done.
 */
export type JobStatus = "queued" | "working" | "done" | "cancelled";

/** An agent connected to the hub, as the page shows it. */
/**
 * A component declared in the agent's project (`POST /components`, for the
 * comment box's `@` list): its name and where it is, relative to the
 * project's folder (see ComponentFile).
 */
export interface ProjectComponent {
  name: string;
  file: string;
  line?: number;
}

/**
 * A design token from a file in the agent's project (`POST /tokens`): one
 * that never reaches the page as a CSS variable (a `tokens.json`, a Sass
 * variable). `name` as the file has it (`color.brand.primary`, `$brand`),
 * `value` resolved (aliases followed), `file` relative to the workspace's
 * root (see ProjectComponent).
 */
export interface FileToken {
  name: string;
  value: string;
  file: string;
  line?: number;
}

export interface AgentInfo {
  id: string;
  /** "Claude Code · pilot": the agent's client name and its project folder. */
  label: string;
  /**
   * The agent's project folder (absolute), for the hub to read the
   * project's components from (`POST /components`). The hub keeps it to
   * itself: what it sends pages never has it.
   */
  folder?: string;
  /**
   * Which agent's command-line tool runs the jobs (`claude`, `codex`,
   * `cursor`), for the hub to list that agent's skills from its folders
   * (`POST /skills`). Kept to the hub, like `folder`; a hub that doesn't
   * know it passes it on, harmless (no path in it).
   */
  kind?: string;
}

/**
 * A skill of the agent Pilot runs for the page (`POST /skills`, for the
 * comment box's `/` list): its name and description, from its `SKILL.md`.
 * Where it is stays with the hub.
 */
export interface ProjectSkill {
  name: string;
  description?: string;
}

/** A skill's name, as agents name them (`better-ui`, `ui:polish`): what may go into a prompt's first line. */
export const SKILL_NAME = /^[A-Za-z0-9][\w.:-]{0,63}$/;

/** One Send: a change set for an agent to apply. */
export interface Job {
  /** Made by the page, unique: also the change set's id. */
  id: string;
  /** The page it came from (`http://localhost:5173`). */
  origin: string;
  changeSet: ChangeSet;
  status: JobStatus;
  /** The agent working on it (or that did it). */
  agent?: AgentInfo;
  /** What the agent said when done: values it approximated, what it did differently. */
  notes?: string;
  /**
   * 1 for the job as sent; 2 for its one follow-up, when some changes didn't
   * come out as the designer set them (`differences`). After the follow-up,
   * Pilot takes what the code gives.
   */
  attempt?: number;
  /** For the follow-up: what the page gave instead of what the designer set. */
  differences?: ChangeResult[];
  /** For a task's follow-up: what Pilot's width check found (see WidthCheck). */
  issues?: string[];
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  /** When an agent took it, and when it reported it done (the latest attempt's): to see where a job's time goes. */
  takenAt?: string;
  doneAt?: string;
  /**
   * The agent asked the designer something instead of guessing (pilot_done's
   * `question`): the job is done but waits for the answer, which Pilot asks
   * in a comment thread on the job's first element. Pilot doesn't check it
   * meanwhile: what the agent left for the answer isn't in the code yet.
   */
  question?: AgentQuestion;
  /** The designer's answer to `question`: the job went back to the agent with it (once). */
  answer?: string;
  /** A `/props` job's answer: the component's props, as the agent read them (see PropSpec). */
  props?: PropSpec[];
  /** The agent's session for this job, when Pilot ran the agent: its follow-up resumes it, and a comment thread keeps it for its next message. */
  session?: AgentSession;
  /** Pilot couldn't run the agent for it (not installed, not signed in, the run failed): what's wrong and what to do. The job is done, unapplied. */
  error?: JobError;
}

/** Why a job couldn't run, for the designer: a title ("Claude Code isn't signed in") and what to do ("Run claude auth login in a terminal"). */
export interface JobError {
  title: string;
  detail: string;
}

/**
 * A question from the agent to the designer, about a job (see Job.question).
 * Non-blocking: the agent goes on with its next jobs; the answer comes back
 * as this job again. Mostly "all of them, or only this one?", when the
 * designer changed only some copies of shared code (ElementTarget.lookAlikes).
 */
export interface AgentQuestion {
  /** One short sentence. */
  text: string;
  /** One-click answers (at most MAX_CHOICES, a few words each); the designer can also write one. */
  choices?: string[];
}

/** One-click answers to a question, at most. */
export const MAX_CHOICES = 4;

/** An agent's question (see AgentQuestion), its text and choices trimmed and capped; undefined when it isn't one. */
export function questionOf(value: unknown): AgentQuestion | undefined {
  const q = value as { text?: unknown; choices?: unknown } | undefined;
  if (typeof q?.text !== "string" || !q.text.trim()) return undefined;
  const choices = (Array.isArray(q.choices) ? q.choices : [])
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, MAX_CHOICES);
  return { text: q.text.trim().slice(0, 500), ...(choices.length ? { choices } : {}) };
}

/**
 * An agent session from a page or a run (see AgentSession), checked: its id
 * becomes an argument of the agent's command, so only plain ids (letters,
 * digits, dashes, like the UUIDs agents use) pass.
 */
export function sessionOf(value: unknown): AgentSession | undefined {
  const s = value as { agent?: unknown; id?: unknown } | undefined;
  if (typeof s?.agent !== "string" || !/^[a-z]{1,20}$/.test(s.agent)) return undefined;
  if (typeof s.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{7,99}$/.test(s.id)) return undefined;
  return { agent: s.agent, id: s.id };
}

/** A job's error from a run (see JobError), trimmed; undefined when it isn't one. */
export function jobErrorOf(value: unknown): JobError | undefined {
  const e = value as { title?: unknown; detail?: unknown } | undefined;
  if (typeof e?.title !== "string" || !e.title.trim()) return undefined;
  return { title: e.title.trim().slice(0, 200), detail: typeof e.detail === "string" ? e.detail.trim().slice(0, 1000) : "" };
}

/** Props at most, from one `/props` answer. */
export const MAX_PROPS = 20;

/** The props an agent returned (see PropSpec), checked and capped; undefined when there are none. */
export function propsOf(value: unknown): PropSpec[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const scalar = (v: unknown): v is PropValue => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
  const props = value.flatMap((p): PropSpec[] => {
    const name = typeof p?.name === "string" ? p.name.trim().slice(0, 60) : "";
    const type = ["options", "boolean", "text", "number"].includes(p?.type) ? (p.type as PropSpec["type"]) : null;
    if (!name || !type) return [];
    const options: string[] = Array.isArray(p.options)
      ? [...new Set<string>((p.options as unknown[]).filter(scalar).map(String))].slice(0, 30)
      : [];
    if (type === "options" && !options.length) return [];
    return [
      {
        name,
        type,
        ...(type === "options" ? { options } : {}),
        ...(scalar(p.default) ? { default: p.default } : {}),
        ...(typeof p.description === "string" && p.description.trim() ? { description: p.description.trim().slice(0, 120) } : {}),
      },
    ];
  });
  return props.length ? props.slice(0, MAX_PROPS) : undefined;
}

/**
 * How a change of a done job came out, checked by the page against its real
 * CSS once the agent is done (see the overlay's edits/verify.ts):
 * - landed: the page's own CSS now gives the designer's value;
 * - differs: it gives another (`actual`, computed);
 * - unchecked: can't be checked at this window width (a change for other widths).
 */
export interface ChangeResult {
  selector: string;
  property: string;
  expected: string;
  outcome: "landed" | "differs" | "unchecked";
  actual?: string;
}

/**
 * Pilot's width check for a task about one element (Make responsive): the
 * page loads itself in hidden frames at each width and measures the element
 * there, so the agent gets numbers instead of screenshots. Problems the
 * element already has at the designer's width are left out: that width is
 * the designer's, as they see it.
 */
export interface WidthCheck {
  /** The element's selector. */
  selector: string;
  /** The designer's window width when they asked. */
  designerWidth: number;
  widths: WidthReport[];
  /**
   * What changed at the designer's width since they asked (computed styles
   * of the element and what's inside it), when Pilot took a baseline. The
   * task should leave that width as it was.
   */
  changedAtDesignerWidth?: string[];
  /**
   * How Pilot got the page: `copy`, a copy of it as the designer has it,
   * with scripts off (layout that only changes through JavaScript doesn't
   * respond in it); `load`, loaded from its URL (the copy didn't have the element).
   */
  source?: "copy" | "load";
  /** Problems to fix: the issues of every width, and anything changed at the designer's width. */
  problems: number;
}

/** The element at one viewport width. */
export interface WidthReport {
  width: number;
  /** Whether the selector found the element in the page loaded at that width. */
  found: boolean;
  /** `1216×420`, and its layout: `grid, 3 columns`, `flex row, wraps`, `block`. */
  size?: string;
  layout?: string;
  /** Problems with the element or what's inside it: sticking out of the viewport, clipped, overlapping… */
  issues: string[];
  /** Worth knowing, not problems: tap targets under 24px, the page scrolling sideways because of other elements. */
  notes: string[];
}

/** Events the hub sends a page (Server-Sent Events on GET /events). */
export type PageEvent =
  /** On connect and whenever agents come or go for this page's origin. */
  | { type: "agents"; agents: AgentInfo[]; waiting: number }
  /** Pilot started for this page's site (`npx usepilot`): launch it. */
  | { type: "launch"; agent: AgentInfo }
  /** A job changed (taken, done…). */
  | { type: "job"; job: Job }
  /** An agent asks for a width check of a job's element: the page that has the job posts it to `/checks/:requestId`. */
  | { type: "check"; requestId: string; jobId: string }
  /** The designer closed Pilot on this site (in this tab or another): close it here too. */
  | { type: "quit" };

/** `{ origin }` an agent works on, from a URL: `http://localhost:5173/about` → `http://localhost:5173`. */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url.includes("://") ? url : `http://${url}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Whether `hostname` is a development address, never a server's: this
 * machine (localhost, *.localhost, 127.x, ::1, 0.0.0.0), a local name
 * (*.local, *.test, *.internal, *.lan, *.home.arpa, or one with no dot,
 * like MAMP's `nucleo`), or a private network (10.x, 172.16–31.x, 192.168.x,
 * 169.254.x, IPv6 fc00::/7 and fe80::/10, a phone on the Wi-Fi). Pilot only
 * runs on these (mountPilot), and `npx usepilot` only takes a site from these
 * without being told (`--url`): it must never run in production.
 */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return false;
  if (h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "::") return true;
  if (/\.(localhost|local|test|internal|lan|home\.arpa)$/.test(h)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (h.includes(":")) return /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
  // A name with no dot (`nucleo`, `myapp`): only a local resolver answers it.
  return !h.includes(".");
}

/**
 * The same origin for `localhost`, `127.0.0.1` and `[::1]`: an agent that
 * says `localhost:5173` gets the page opened at `127.0.0.1:5173`.
 */
export function sameOrigin(a: string, b: string): boolean {
  return originKey(a) === originKey(b);
}

/** An origin with `127.0.0.1` and `[::1]` written as `localhost`: how the hub files pages and agents. */
export function originKey(origin: string): string {
  return origin.replace(/^(https?:\/\/)(?:127\.0\.0\.1|\[::1\])(?=[:/]|$)/, "$1localhost").replace(/\/$/, "");
}
