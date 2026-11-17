/**
 * The bridge: how the page (Pilot's overlay) and coding agents meet.
 *
 * One hub per machine listens on 127.0.0.1 (DEFAULT_BRIDGE_PORT). It lives
 * in the first `pilot mcp` process an agent starts; later ones talk to it over
 * HTTP and take over if it goes away. The page sends jobs and listens to
 * Server-Sent Events; agents take jobs (`pilot_wait_for_edits`) and report
 * them done (`pilot_done`). Jobs are routed by the page's origin: an agent
 * gets jobs only from the page it launched Pilot in.
 */
import type { ChangeSet } from "./types.ts";

export const DEFAULT_BRIDGE_PORT = 4747;

/** Bumped when the hub's HTTP API changes incompatibly. 2: width checks (`/agents/check`, `/checks/:id`). */
export const BRIDGE_VERSION = 2;

/**
 * - queued: sent by the designer, waiting for an agent;
 * - working: an agent took it;
 * - done: the agent reported it applied (`pilot_done`);
 * - cancelled: the designer took it back before it was done.
 */
export type JobStatus = "queued" | "working" | "done" | "cancelled";

/** An agent connected to the hub, as the page shows it. */
export interface AgentInfo {
  id: string;
  /** "Claude Code · pilot": the agent's client name and its project folder. */
  label: string;
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
