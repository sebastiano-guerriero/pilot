/**
 * The change-set model: what Pilot records while a designer edits, and what
 * gets handed to the agent (via clipboard or the local bridge).
 *
 * Pilot never edits source files. It captures *intent* as plain CSS
 * (property, before, after) on identifiable elements; the agent translates
 * that into the project's own conventions (Tailwind classes, CSS modules,
 * design tokens, styled-components...).
 */

/** How to find the edited element again. Several hints, from most to least precise. */
export interface ElementTarget {
  /** A CSS selector that matched exactly this element at capture time. */
  selector: string;
  /**
   * Where the element is, by tags and positions only (no classes):
   * `#react > main > div > article:nth-of-type(1)`. For Pilot to find it
   * again when its classes changed since (a variant picked, a prop set);
   * see the overlay's findTarget.
   */
  at?: string;
  /** Human-readable DOM path, e.g. `main > section.hero > h1`. */
  path: string;
  tag: string;
  id?: string;
  classes: string[];
  /** Trimmed snippet of the element's text, to help the agent grep for it. */
  text?: string;
  /**
   * How many elements like it are on the page outside the job: the same
   * part of each copy of what repeats (every card's title), found by Pilot
   * from the page's structure. When they come from the same code, the
   * designer changed only some copies: the agent asks before changing them
   * all (see AgentQuestion). Absent: none.
   */
  lookAlikes?: number;
  /**
   * The component the look-alikes are instances of, when Pilot found them by
   * component (React, Vue: every `<ProductCard>`, whatever its props) rather
   * than by the page's structure.
   */
  lookAlikesOf?: string;
  /** The component rendering it and its file, from the framework's dev info (React, Vue), when the page has it; the CLI finds a file the page couldn't name (`componentFile`). */
  source?: {
    component?: string;
    file?: string;
    line?: number;
  };
  /**
   * What Pilot's code search finds the element by, besides its own tag,
   * classes, id and text (the CLI's locate.ts): no one detail is reliable
   * (classes repeat, text comes from data), several together are.
   */
  context?: ElementContext;
}

/** See ElementTarget.context. Each list short and capped: a few strings each. */
export interface ElementContext {
  /** The texts inside it, each on its own: its own text nodes and its descendants' (a nav's link labels), trimmed, in page order. */
  texts?: string[];
  /** Attribute values that say what it is, its own and its descendants': `href`, `src`, `alt`, `aria-label`, `title`, `name`, `placeholder`, `for`, `style`, `data-*`. */
  attrs?: string[];
  /** Its parent, grandparent and great-grandparent, nearest first. */
  parents?: Array<{ tag: string; id?: string; classes: string[] }>;
  /** The page's texts right before and right after it (outside it): which of several copies of the same markup it is (the `#` beside each heading). */
  before?: string;
  after?: string;
  /** The nearest heading above it on the page (outside it): which section of several alike it's in. */
  heading?: string;
}

export interface StyleChange {
  /** CSS property in kebab-case, e.g. `border-radius`. */
  property: string;
  /**
   * The page's own value before the edit, as declared in its CSS (`16px`,
   * `var(--space-4)`), or "" when the page doesn't set the property.
   */
  from: string;
  /** Value the designer set ("" when `removed`). */
  to: string;
  /**
   * The designer removed the property for this element: it shouldn't declare
   * it at all, so it gets whatever the cascade gives without that
   * declaration (another rule, the inherited value, or the default). Not the
   * same as setting it to `0` or `none`. `from` is the removed value.
   */
  removed?: boolean;
  /** Where `from` is declared in the page's CSS, when known. */
  source?: StyleSource;
  /**
   * The viewport widths the change is for, as the designer set them (the
   * width chip in Pilot's search). Absent: every width.
   */
  widths?: WidthRange;
  /**
   * The element states the change is for, together (`["hover", "active"]`:
   * hovered and pressed), in STATES order. Absent: the element as it is.
   */
  states?: ElementState[];
  /**
   * What already gives `to` on the page now: its tokens (`var(--space-md)`)
   * and its single-purpose classes (`.padding-md`), compared as the browser
   * computes them. `fluid`: some tokens change with the viewport, equal at
   * this width only. Absent: none, or `to` is a token already.
   */
  equivalents?: { tokens: string[]; classes: string[]; fluid?: boolean };
}

/** The element states a change can be for: CSS's pseudo-classes, Tailwind's variants. */
export type ElementState = "hover" | "focus" | "focus-visible" | "active";

/** Every state, in the order they're written (Tailwind's variant order: `hover:focus:active:`). */
export const STATES: readonly ElementState[] = ["hover", "focus", "focus-visible", "active"];

/** States in STATES order, each once. */
export function sortStates(states: Iterable<ElementState>): ElementState[] {
  const set = new Set(states);
  return STATES.filter((s) => set.has(s));
}

/**
 * Viewport widths in CSS px, both ends included: `{ min: 768 }` is 768px and
 * up, `{ max: 767 }` is to 767px (and below), `{ min: 768, max: 1199 }` is 768–1199px.
 * At least one end is set.
 */
export interface WidthRange {
  min?: number;
  max?: number;
}

/** Where a value is declared in the page's CSS. */
export type StyleSource =
  /** The element's own style attribute, in the app's markup. */
  | { kind: "inline" }
  /**
   * A stylesheet rule. `elements`: how many elements on the page that
   * selector matches, so the agent can tell a one-off from a shared rule.
   */
  | {
      kind: "rule";
      selector: string;
      elements?: number;
      /** The `@media` conditions the rule sits in, e.g. `(min-width: 768px)`, when any. */
      media?: string;
    };

/**
 * The designer rewrote some of the element's text (double-click, inline):
 * its copy, not its style. The whole text of an element that has only text,
 * or one run of it between child elements (the text before a `<code>`).
 * Whitespace runs are one space, trimmed.
 */
export interface TextChange {
  /** The page's own text before the edit. */
  from: string;
  /** The text the designer typed. */
  to: string;
}

export interface ElementEdit {
  target: ElementTarget;
  /** CSS changes; empty when only the text changed. */
  changes: StyleChange[];
  /** New texts for the element, when the designer edited them (one per text run). */
  texts?: TextChange[];
}

/**
 * A task for the agent about one element, sent instead of edits: the
 * selection's Make responsive action. The agent works out the changes
 * itself (formatPrompt spells out how); there are no designer values, so
 * Pilot can't check the result and takes the agent's word.
 */
export interface ResponsiveRequest {
  kind: "responsive";
  target: ElementTarget;
  /** The other elements selected with `target` (see requestTargets). */
  others?: ElementTarget[];
  /**
   * The viewport widths the page's media queries test, in CSS px, ascending
   * (Pilot reads them from its stylesheets). Empty when it has none.
   */
  breakpoints: number[];
  /** Files the designer attached when asking (from the comment box's `/` actions), as on a comment. */
  attachments?: CommentAttachment[];
  /** What the designer mentioned with `@` in its note, as on a comment (see CommentReference). */
  references?: CommentReference[];
}

/**
 * Break and fix: the agent stress-tests one element with odd but realistic
 * content (very long text, long words, missing or many items), fixes what
 * breaks without changing its usual look, and puts the real content back.
 * The same shape as Make responsive, and the same width check after.
 */
export interface BreakFixRequest {
  kind: "break-and-fix";
  target: ElementTarget;
  /** The other elements selected with `target` (see requestTargets). */
  others?: ElementTarget[];
  /** The page's breakpoints, as for ResponsiveRequest. */
  breakpoints: number[];
  /** Files the designer attached when asking, as on a comment. */
  attachments?: CommentAttachment[];
  /** What the designer mentioned with `@` in its note, as on a comment (see CommentReference). */
  references?: CommentReference[];
}

/** A task about one element (not edits, not a comment): Pilot checks it at every width when it's done. */
export type TaskRequest = ResponsiveRequest | BreakFixRequest;

/** The task kinds, for code that treats them alike. */
export const TASK_KINDS: readonly TaskRequest["kind"][] = ["responsive", "break-and-fix"];

/**
 * An action asked from the comment box (`/responsive`, `/break`, `/props`):
 * a job of its own about the element, shown in the thread as the
 * designer's message. The words typed with it go as its note.
 */
export type CommentAction = TaskRequest["kind"] | "props";

/** A prop's value as Pilot reads it from the page, or as the designer sets it. */
export type PropValue = string | number | boolean;

/**
 * One prop of a component, as the agent reads it from the code (`/props`,
 * returned with `pilot_done`'s `props`): what the designer can set from the
 * thread. `options`: one of a set of values (a variant, a size); `boolean`:
 * on or off; `text` or `number`: typed.
 */
export interface PropSpec {
  name: string;
  type: "options" | "boolean" | "text" | "number";
  /** For `options`: every value it accepts, in the code's order. */
  options?: string[];
  default?: PropValue;
  /** What it does, in a few words, when its name doesn't say. */
  description?: string;
}

/** A prop the designer set on one instance, from what it was (on the page) to what they picked. */
export interface PropChange {
  name: string;
  from?: PropValue;
  to: PropValue;
}

/**
 * `/props` on a component's instance: the agent reads the component's code
 * and lists the props that change how it looks (see PropSpec), changing
 * nothing. Pilot shows them in the thread; the designer's picks go back as
 * a comment (`props` on the message).
 */
export interface PropsRequest {
  kind: "props";
  target: ElementTarget;
  others?: ElementTarget[];
  breakpoints: number[];
  /** The component the element is the top of: its instance's props are the ones listed. */
  component: string;
  /** The instance's props now, read from the page (strings, numbers, on-off; not handlers, children or objects). */
  current: Record<string, PropValue>;
  /** The file where this instance is written (`<ProductCard …>`), when the framework says. */
  usedIn?: string;
  /** Files the designer attached when asking, as on a comment. */
  attachments?: CommentAttachment[];
  /** What the designer mentioned with `@` in its note, as on a comment. */
  references?: CommentReference[];
}

/** One message of a comment thread: the designer's, or the agent's reply (its `pilot_done` notes). */
export interface CommentMessage {
  from: "designer" | "agent";
  /** The words; may be empty when the designer sent only attachments. */
  text: string;
  /** ISO timestamp. */
  at: string;
  /** Files the designer attached (screenshots, sketches, notes, a spec): they may hold the instructions. */
  attachments?: CommentAttachment[];
  /** The designer's message asked for an action (Make responsive), sent as a task: see CommentAction. */
  action?: CommentAction;
  /**
   * The designer picked one of their agent's skills from the `/` list (its
   * name, see ProjectSkill): the comment goes as usual, and the agent uses
   * that skill for it.
   */
  skill?: string;
  /** What the designer mentioned with `@` (a token, a component, an element), picked from Pilot's list: exact, for the agent to use as is. */
  references?: CommentReference[];
  /** The props the designer set on the instance, from the agent's `/props` list: where it's written, not in the component. */
  props?: { component: string; usedIn?: string; set: PropChange[] };
}

/**
 * Something the designer mentioned in a comment with `@`, picked from
 * Pilot's list or typed: a design token with its value now, a component
 * (with an instance on the page, or its file in the project), an element on
 * the page, or a name Pilot found nowhere (`unlisted`, for the agent to look
 * for). `name` is the thing's own name: the text reads it as `mentionText()`
 * (a token as is, the others after `@`).
 */
export type CommentReference =
  | { kind: "token"; name: string; value: string; source?: ComponentFile }
  | { kind: "component"; name: string; target?: ElementTarget; source?: ComponentFile }
  | { kind: "element"; name: string; target: ElementTarget }
  | { kind: "unlisted"; name: string };

/** Where a component is declared in the project, relative to the project's folder. */
export interface ComponentFile {
  file: string;
  line?: number;
}

/** How a reference reads in the comment's text: a token by its name (`--color-accent`), the others after `@` (`@ProductCard`). */
export function mentionText(reference: CommentReference): string {
  return reference.kind === "token" ? reference.name : `@${reference.name}`;
}

/**
 * A file attached to a comment: an image, a text file or a PDF. The page
 * uploads it to the hub, which saves it in the OS temp folder (never the
 * project) and names it by its content (`id`: a SHA-256 and the type's
 * extension). The page sends only the id; the hub, taking the job, adds
 * `path`, so a page can't point the agent at another file.
 */
export interface CommentAttachment {
  id: string;
  /** The file's name on the designer's machine, for the prompt. */
  name?: string;
  /** Where the hub saved it (absolute): set by the hub, never by the page. */
  path?: string;
}

/** The types an attachment can be, by the extension it's saved with. */
export const ATTACHMENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
} as const;

export type AttachmentExtension = keyof typeof ATTACHMENT_TYPES;

/** An attachment id: a SHA-256 of the file, and its type's extension. */
export const ATTACHMENT_ID = /^[a-f0-9]{64}\.(png|jpg|gif|webp|pdf|txt|md|csv|json)$/;

/** What an attachment is, from its id or file name: how it's previewed and shown to the agent. */
export function attachmentKind(name: string): "image" | "pdf" | "text" {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "pdf" ? "pdf" : ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "webp" ? "image" : "text";
}

/** File extensions taken as each type when the browser gives none (or a vague one): `.md`, `.log`… */
const BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  log: "text/plain",
  text: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
};

/** The type a file is attached as, from its name and the type the browser gave; null when Pilot doesn't take it. */
export function attachmentType(name: string, type: string): string | null {
  const given = type.split(";")[0]?.trim().toLowerCase() ?? "";
  if ((Object.values(ATTACHMENT_TYPES) as string[]).includes(given)) return given;
  return BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

/** What the file picker offers: the types, and the extensions browsers may give no type for. */
export const ATTACHMENT_ACCEPT = [...new Set(Object.values(ATTACHMENT_TYPES))].join(",") + "," + Object.keys(BY_EXTENSION).map((e) => `.${e}`).join(",");

/**
 * A comment on one element (the toolbar's Comment tool): free text, sent
 * right away. The thread's last message is the designer's, what to do now;
 * the ones before it are the conversation so far.
 */
export interface CommentRequest {
  kind: "comment";
  /** The thread's agent session, when Pilot ran the agent for its earlier messages: resumed, so the agent remembers the thread (see AgentSession). */
  session?: AgentSession;
  target: ElementTarget;
  /** The other elements selected with `target` (see requestTargets). */
  others?: ElementTarget[];
  thread: CommentMessage[];
  /** The page's breakpoints, as for ResponsiveRequest: the comment may be about one width. */
  breakpoints: number[];
}

export type AgentRequest = TaskRequest | CommentRequest | PropsRequest;

/**
 * A session of the agent's command-line tool, when Pilot runs the agent for
 * a job (docs/handoff.md, *Agent runs*): which agent (`claude`, `codex`,
 * `cursor`), and its session id there. Resumed for the job's follow-up and
 * a comment thread's next message; only by the same agent.
 */
export interface AgentSession {
  agent: string;
  id: string;
}

/**
 * The elements a request is about: `target`, the first the designer
 * selected (where the comment's thread is, and the one Pilot's width check
 * measures), then the others selected with it. A comment or a task on
 * several elements is one job about all of them ("these cards").
 */
export function requestTargets(request: AgentRequest): ElementTarget[] {
  return [request.target, ...(request.others ?? [])];
}

export interface ChangeSet {
  id: string;
  /** ISO timestamp. */
  createdAt: string;
  page: {
    url: string;
    title: string;
    viewport: { width: number; height: number };
  };
  edits: ElementEdit[];
  /** A task instead of edits (then `edits` is empty): see AgentRequest. */
  request?: AgentRequest;
  /** Free-form note from the designer ("make this feel lighter", etc.). */
  note?: string;
  /**
   * The project's file tokens its changes use (`var(--color-brand-primary)`):
   * CSS variables of Pilot's own, for the preview, that stand for tokens in
   * the project's files (`color.brand.primary` in `tokens/colors.json`). The
   * agent writes the token the project's way, never the `var(--…)`.
   */
  fileTokens?: FileTokenUse[];
}

/** A file token a change uses: its variable in Pilot's preview, and the token it stands for. */
export interface FileTokenUse {
  variable: string;
  name: string;
  value: string;
  file: string;
  line?: number;
}
