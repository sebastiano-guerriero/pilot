/**
 * The bridge: how the page (Pilot's overlay) and coding agents meet.
 *
 * One hub per machine and bridge version listens on 127.0.0.1 (DEFAULT_BRIDGE_PORT). It lives
 * in the first `pilot mcp` process an agent starts; later ones talk to it over
 * HTTP and take over if it goes away. The page sends jobs and listens to
 * Server-Sent Events; agents take jobs (`pilot_wait_for_edits`) and report
 * them done (`pilot_done`). Jobs are routed by the page's origin: an agent
 * gets jobs only from the page it launched Pilot in.
 */
import type { ChangeSet, PropSpec, PropValue } from "./types.ts";

/** Bumped when the hub's HTTP API changes incompatibly. 2: width checks (`/agents/check`, `/checks/:id`). 3: comment images (`/attachments`). 4: the agent's questions (`question` on `/agents/done`, `/jobs/:id/answer`). */
export const BRIDGE_VERSION = 4;

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
}

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
  /** An agent ran /pilot for this page: launch Pilot. */
  | { type: "launch"; agent: AgentInfo }
  /** A job changed (taken, done…). */
  | { type: "job"; job: Job }
  /** An agent asks for a width check of a job's element: the page that has the job posts it to `/checks/:requestId`. */
  | { type: "check"; requestId: string; jobId: string };

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
