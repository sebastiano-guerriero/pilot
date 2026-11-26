import {
  ATTACHMENT_ACCEPT,
  attachmentKind,
  attachmentType,
  type CommentAction,
  type ProjectComponent,
  type ProjectSkill,
  type PropChange,
  type PropValue,
} from "@pilot/protocol";
import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { CommentThread } from "../../../bridge/session.ts";
import type { PlacedRect } from "../../../select/useElementRect.ts";
import { px } from "../../px.ts";
import { useWindowScroll } from "../../useWindowScroll.ts";
import { Icon } from "../Icon/Icon.tsx";
import { PageAnchor } from "../PageAnchor/PageAnchor.tsx";
import { dialogAnchor, dialogPosition, dialogSpot, raisedSpot } from "../PropertyDialog/PropertyDialog.tsx";
import { type ChangeCounts, changesLabel } from "../../changesLabel.ts";
import { PropsList } from "../PropsList/PropsList.tsx";
import { ScrollThumb } from "../ScrollThumb/ScrollThumb.tsx";
import { scrollWithin } from "../../../dom/reveal.ts";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { actionAt, actionCommand, actionName, matchActions, matchSkills, PILOT_AUTHOR, withoutQuery } from "./actions.ts";
import { renderMarkdown } from "./markdown.tsx";
import { propsInText } from "./propLines.ts";
import { insertMention, matchMentions, type MentionOption, mentionAt, mentionsIn, projectOptions, splitMentions } from "./mentions.ts";

/** How sending went: to the agent, or not at all. */
/** What sending did: sent; not sent, quietly (nothing to send); or not sent, and why (shown as a red reply). */
export type CommentOutcome = "sent" | false | CommentError;

/** Something went wrong, or is stuck, in the thread: shown as a red reply, in place of the reply to come. */
export interface CommentError {
  title: string;
  detail: string;
}

interface CommentWidgetProps {
  element: Element;
  /** The element's box (viewport px), to open beside it. */
  anchor: PlacedRect;
  /**
   * The element the spot is picked beside, when it isn't `element`: with
   * several selected, the latest one (App). Picked again when it changes,
   * so the panel follows the last element added.
   */
  placeBy?: Element;
  /**
   * Out of sight for a moment (the redlines, Alt held: App), still there:
   * its search, its fields and its focus stay as they are.
   */
  veiled?: boolean;
  /** The element's thread, once it has one. */
  thread: CommentThread | null;
  /**
   * Where its latest comment stands, in words ("Waiting for an agent"), while
   * it isn't done: shown as the agent's reply to come, with a shimmer.
   */
  status?: string;
  /**
   * The latest comment's job is stuck (see PilotSession.stuck): a red reply
   * says what's wrong and what to do, in place of `status`.
   */
  error?: CommentError;
  /** The thread's latest job is with the agent and can still be taken back: a stop button beside send cancels it. */
  onStop?(): void;
  /** An agent is on the page: without one, the send button is disabled (comments go to an agent only). */
  agentOn?: boolean;
  /** Who replies ("Claude Code · app"), for the agent's messages. */
  agentName?: string;
  /**
   * Adjust what the agent did by hand: the latest reply, once a job's done,
   * has a button that switches to Select, with the thread's elements
   * selected, so the property dialog opens on them (its width chip and state
   * pills reach what a comment can't).
   */
  onAdjust?(): void;
  /**
   * Sends the comment: its words, the files attached, and the action picked
   * from the `/` menu (Make responsive) or the agent's skill picked there;
   * any of them may be missing, but not all; and what it mentions with `@`
   * (see mentionsIn: picked from the list, or typed).
   */
  onSend(
    text: string,
    files: File[],
    action?: CommentAction,
    mentions?: MentionOption[],
    withEdits?: boolean,
    props?: PropChange[],
    skill?: string,
  ): Promise<CommentOutcome> | CommentOutcome;
  /**
   * The selected elements' edits not sent yet (the editor's): they go with
   * the comment, shown as a chip the designer can take off (then they wait
   * for Send). Not with an action: a task goes apart from the changes.
   */
  edits?: ChangeCounts;
  /** The component the selection is an instance of (its top-level element), alone: `/props` is offered then. */
  component?: string;
  /** The instance's props now, from the page (see componentProps): the props list shows them. */
  currentProps?(): Record<string, PropValue>;

  /** What `@` can mention, read from the page each time the list opens (App: tokens, components, elements). */
  mentions?(): MentionOption[];
  /** The project's components, from Pilot's server (with an agent on the page), asked for each time the list opens: listed after the page's. */
  projectComponents?(): Promise<ProjectComponent[]>;
  /** The agent's skills, from Pilot's server (with an agent on the page), asked for when the box opens and each time the `/` list does: listed after the actions. */
  skills?(): Promise<ProjectSkill[]>;
  /** The designer is done with the thread: it goes. `from` is Mark as solved's box (for its confetti). */
  onResolve?(from?: DOMRect): void;
  onClose(): void;
  /** What's already written, when it opens again after a reload (App keeps it: selectionKeep.ts). */
  initialText?: string;
  /** What's written, as it changes: App keeps it through a reload. */
  onTextChange?(text: string): void;
  /** Take focus when it opens (not when the selection came from the DOM tree, which keeps it). */
  autoFocus?: boolean;
}

/** Resolve's shortcut, as the keyboard names it. */
const RESOLVE_KEYS = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌥ + Enter" : "Alt + Enter";

/** A file attached to the comment being written: an image (with its preview's object URL), a text file or a PDF. */
interface Attachment {
  id: number;
  file: File;
  url?: string;
}

let nextAttachment = 0;
const toAttachment = (file: File): Attachment => ({
  id: ++nextAttachment,
  file,
  url: attachmentKind(file.name) === "image" ? URL.createObjectURL(file) : undefined,
});

/** A file's tile when it isn't an image: its extension ("PDF", "MD"). Placeholder look, pending the design. */
function FileTile({ name }: { name: string }) {
  return <span class="file-type">{(name.split(".").pop() ?? "").slice(0, 4).toUpperCase()}</span>;
}

/** The field's placeholder: what to write, and the two lists it opens (`/` actions, `@` mentions, when there's something to mention). */
function placeholder(withAction: boolean, reply: boolean, mentions: boolean): string {
  if (withAction) return mentions ? "Add details (optional), @ to mention" : "Add details (optional)";
  const lead = reply ? "Reply" : "Ask the agent";
  return mentions ? `${lead}, / for skills, @ to mention` : `${lead}, or / for skills`;
}

/** How long Copy instructions says it copied, in ms. */
const COPIED_FOR = 1500;

/**
 * Copy instructions, under a reply whose run was refused an MCP server or a
 * site: copies the request for the designer's agent (Job.allow), which they
 * paste into its chat; their agent edits its settings and asks them to
 * confirm. Pilot never allows anything itself (security first).
 */
function CopyAllow({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), COPIED_FOR);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      class="choice"
      data-secondary
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!navigator.clipboard) return setState("failed");
        navigator.clipboard.writeText(text).then(
          () => setState("copied"),
          () => setState("failed"),
        );
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy instructions"}
    </button>
  );
}

/**
 * Skills a bare `/` lists, the first few (as the `@` list's few per group). Once something's typed, every
 * match, the best first: the list scrolls. Before, `/emil` showed six of a collection's skills, and the
 * rest couldn't be reached by narrowing further when their names share the prefix.
 */
const SKILLS_SHOWN = 6;

/** The longest the field grows to before it scrolls, in px. */
const FIELD_MAX = 120;

/**
 * The Comment tool's panel, beside the selected element where the property
 * dialog would be (and placed the same way: picked once, moves with the
 * page, never jumps while you type, draggable by its top strip): the
 * element's thread (the designer's comments, the agent's replies), where
 * the latest stands, and a field to write the next one.
 * - Enter sends, at once, to the agent working on the page (with none,
 *   it can't), Shift+Enter starts a new line, Esc closes.
 * - Option+Enter (Alt+Enter) resolves the thread, like Mark as solved:
 *   Option, like Pilot's other shortcuts.
 */
export function CommentWidget({
  element,
  anchor,
  placeBy,
  veiled = false,
  thread,
  status,
  error,
  agentName,
  onSend,
  onResolve,
  onAdjust,
  onClose,
  autoFocus = true,
  agentOn = true,
  mentions,
  projectComponents,
  skills,
  edits = { styles: 0, texts: 0 },
  component,
  currentProps,
  initialText,
  onTextChange,
  onStop,
}: CommentWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const resolveRef = useRef<HTMLButtonElement>(null);
  const resolve = () => onResolve?.(resolveRef.current?.getBoundingClientRect());
  const [text, setText] = useState(initialText ?? "");
  useEffect(() => onTextChange?.(text), [text]);
  // A send that failed (an attachment didn't upload): its red reply, until the next try.
  const [failed, setFailed] = useState<CommentError | null>(null);
  const shownError = failed ?? error;
  // Files attached to the comment being written (images, text files, PDFs), previewed above the field.
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attach = (files: FileList | null) => {
    const taken = [...(files ?? [])].filter((f) => attachmentType(f.name, f.type));
    if (taken.length) setAttachments((all) => [...all, ...taken.map(toAttachment)]);
    fieldRef.current?.focus();
  };
  // Files dropped anywhere on the widget attach as if picked. `over` counts
  // the drag's enters and leaves, as it crosses the widget's children.
  const over = useRef(0);
  const [dropping, setDropping] = useState(false);
  const carriesFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
  const onDragEnter = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    over.current += 1;
    setDropping(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    // Taken here, so the browser doesn't open the file in the tab instead.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    over.current = Math.max(0, over.current - 1);
    if (over.current === 0) setDropping(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    over.current = 0;
    setDropping(false);
    attach(e.dataTransfer?.files ?? null);
  };
  const detach = (attachment: Attachment) => {
    if (attachment.url) URL.revokeObjectURL(attachment.url);
    setAttachments((all) => all.filter((a) => a !== attachment));
    fieldRef.current?.focus();
  };
  // The previews' object URLs go with the widget.
  const shown = useRef(attachments);
  shown.current = attachments;
  useEffect(() => () => shown.current.forEach((a) => a.url && URL.revokeObjectURL(a.url)), []);

  // Placement: as the property dialog's (see dialogSpot / dialogPosition).
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const width = ref.current?.offsetWidth ?? 0;
    const height = ref.current?.offsetHeight ?? 0;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  });
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const scroll = useWindowScroll(!anchor.at);
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null);
  const beside = placeBy ?? element;
  const placedBeside = useRef(beside);
  useLayoutEffect(() => {
    if (placedBeside.current !== beside) {
      placedBeside.current = beside;
      if (spot) return setSpot(null);
    }
    if (spot || !ref.current) return;
    const box = beside.isConnected ? beside.getBoundingClientRect() : anchor;
    setSpot(dialogSpot(box, ref.current.offsetWidth, vw, scroll));
  });
  useEffect(() => {
    const repick = () => setSpot(null);
    window.addEventListener("resize", repick);
    return () => window.removeEventListener("resize", repick);
  }, []);
  const spotNow = spot ?? dialogSpot(anchor, size.width, vw, scroll);
  const { left, top } = dialogPosition(spotNow, size, { width: vw, height: vh }, scroll);
  useLayoutEffect(() => {
    if (!spot) return;
    const raised = raisedSpot(spot, size, { width: vw, height: vh }, scroll);
    if (raised !== spot) setSpot(raised);
  }, [size.height]);

  const drag = useRef<{
    x: number;
    y: number;
    from: { left: number; top: number };
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onDragStart = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      from: { left: left + scroll.x, top: top + scroll.y },
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const shown = dialogPosition(
      {
        left: d.from.left + e.clientX - d.x,
        top: d.from.top + e.clientY - d.y,
      },
      size,
      { width: vw, height: vh },
      scroll,
    );
    setSpot({ left: shown.left + scroll.x, top: shown.top + scroll.y });
  };
  const onDragEnd = () => {
    drag.current = null;
    setDragging(false);
  };

  useEffect(() => {
    if (autoFocus) fieldRef.current?.focus();
  }, []);
  // The latest message in view: the thread opens scrolled to the bottom, and
  // stays there while its content settles (fonts loading, a reply arriving)
  // unless the designer scrolled up. The fades show only where there's more.
  const count = thread?.messages.length ?? 0;
  const stick = useRef(true);
  const [more, setMore] = useState({ above: false, below: false });
  const measure = () => {
    const list = listRef.current;
    if (!list) return;
    const below = list.scrollHeight - list.scrollTop - list.clientHeight > 1;
    stick.current = !below;
    const above = list.scrollTop > 0;
    setMore((m) => (m.above === above && m.below === below ? m : { above, below }));
  };
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    stick.current = true;
    const pin = () => {
      if (stick.current) list.scrollTop = list.scrollHeight;
      measure();
    };
    pin();
    if (typeof ResizeObserver === "undefined") return;
    const resize = new ResizeObserver(pin);
    resize.observe(list);
    for (const child of list.children) resize.observe(child);
    return () => resize.disconnect();
  }, [count, status, !!shownError]);

  // The field grows with its text, up to FIELD_MAX.
  const fit = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = px(Math.min(field.scrollHeight, FIELD_MAX));
  };
  useLayoutEffect(fit, [text]);

  // Where the caret is (the lists open for what's typed right before it),
  // and where it goes after a pick changes the text.
  const [caret, setCaret] = useState(0);
  const nextCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (nextCaret.current === null || !field) return;
    field.setSelectionRange(nextCaret.current, nextCaret.current);
    setCaret(nextCaret.current);
    nextCaret.current = null;
  }, [text]);

  // The `/` menu: `/` at the start of any word lists the actions (see
  // actions.ts), filtered by what follows; one action per message. ↑/↓
  // move, Enter or Tab picks (the action becomes a chip at the start, its
  // `/word` leaves the text, and the words go with it as its note), Esc
  // closes it, leaving the text as typed. With nothing matching it doesn't
  // show: a `/about` is just text, and Enter sends it. Backspace at the
  // start of the field removes the chip.
  // The designer's skills, after Pilot's own two (Props on a component, and
  // Make responsive): a skill picked is a chip too, and the comment goes as
  // usual, for the agent to use that skill. Asked for when the box opens (so Enter right after `/x`
  // finds them) and again each time the list opens (a skill installed meanwhile).
  const [action, setAction] = useState<CommentAction | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const slash = action || skill ? null : actionAt(text, caret);
  const [slashDismissed, setSlashDismissed] = useState<number | null>(null);
  useEffect(() => {
    if (!slash) setSlashDismissed(null);
  }, [slash?.start]);
  const [skillList, setSkillList] = useState<ProjectSkill[]>([]);
  const slashOpen = !!slash && slashDismissed !== slash.start;
  useEffect(() => {
    if (!skills || (slash && !slashOpen)) return;
    let current = true;
    skills().then(
      (list) => current && setSkillList(list),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [slashOpen]);
  const options = slash && slashOpen ? matchActions(slash.query, { component: !!component }) : [];
  const skillMatches = slash && slashOpen ? matchSkills(skillList, slash.query) : [];
  const skillOptions = slash?.query ? skillMatches : skillMatches.slice(0, SKILLS_SHOWN);
  const menuCount = options.length + skillOptions.length;
  const menuOpen = menuCount > 0;
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [text]);
  // The open list (`/`, `@`) scrolls past its max height (CommentWidget.css), as the property dialog's `/`
  // menu: the highlighted row kept in view, and a fade on each edge with more to scroll to.
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuMore, setMenuMore] = useState({ above: false, below: false });
  const readMenuMore = () => {
    const list = menuRef.current;
    const next = list
      ? { above: list.scrollTop > 0, below: list.scrollTop + list.clientHeight < list.scrollHeight - 1 }
      : { above: false, below: false };
    setMenuMore((current) => (current.above === next.above && current.below === next.below ? current : next));
  };
  useLayoutEffect(readMenuMore);
  useLayoutEffect(() => {
    const list = menuRef.current;
    if (!list) return;
    const rows = list.querySelectorAll("[role=option]");
    // The first and last rows: to the very edge, past the padding, so no fade lies over them.
    if (active === 0) list.scrollTop = 0;
    else if (active === rows.length - 1) list.scrollTop = list.scrollHeight;
    else scrollWithin(list, list.querySelector("[role=option][data-active]"));
  }, [active, text]);
  const fades = (
    <>
      <div class="menu-fade" data-edge="top" data-shown={menuMore.above || undefined} aria-hidden="true" />
      <div class="menu-fade" data-edge="bottom" data-shown={menuMore.below || undefined} aria-hidden="true" />
      <ScrollThumb target={menuRef} />
    </>
  );
  const pick = (index: number) => {
    if (!slash) return;
    const chosen = options[index];
    const chosenSkill = chosen ? undefined : skillOptions[index - options.length];
    if (!chosen && !chosenSkill) return;
    if (chosen) setAction(chosen.id as CommentAction);
    else if (chosenSkill) setSkill(chosenSkill.name);
    const next = withoutQuery(text, slash);
    nextCaret.current = next.caret;
    setText(next.text);
    fieldRef.current?.focus();
  };

  // The `@` menu: `@` at the start of a word, anywhere in the text, lists
  // what can be mentioned (tokens, components, elements on the page; see
  // mentions.ts), filtered by what follows, read from the page when it
  // opens. ↑/↓ move, Enter or Tab picks (its name goes into the text, and
  // the comment carries it as an exact reference), Esc closes it, leaving
  // the text as typed.
  const mention = menuOpen || !mentions ? null : mentionAt(text, caret);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const mentionOpen = !!mention && dismissed !== mention.start;
  // Read as the list opens, in this render (not an effect): a key pressed
  // right after `@x` (Enter, Tab) must find the list there, or it would
  // send the comment, or move focus. Read again the next time it opens.
  // The project's components come a moment later, from the server: the
  // last ones it sent show meanwhile, and the list grows when they arrive.
  const poolRef = useRef<MentionOption[] | null>(null);
  if (!mentionOpen) poolRef.current = null;
  else if (!poolRef.current) poolRef.current = mentions?.() ?? [];
  const [project, setProject] = useState<ProjectComponent[]>([]);
  useEffect(() => {
    if (!mentionOpen || !projectComponents) return;
    let current = true;
    projectComponents().then(
      (list) => current && setProject(list),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [mentionOpen]);
  const withProject = (page: MentionOption[]) => [...page, ...projectOptions(project, page)];
  const pool = poolRef.current && withProject(poolRef.current);
  useEffect(() => {
    if (!mention) setDismissed(null);
  }, [mention?.start]);
  const mentionMatches = mentionOpen && pool && mention ? matchMentions(pool, mention.query) : [];
  const [picked, setPicked] = useState<MentionOption[]>([]);
  const pickMention = (index: number) => {
    const chosen = mentionMatches[index];
    if (!chosen || !mention) return;
    const next = insertMention(text, mention, chosen.insert);
    setPicked((all) => [...all, chosen]);
    nextCaret.current = next.caret;
    setText(next.text);
    fieldRef.current?.focus();
  };
  const readCaret = () => {
    const field = fieldRef.current;
    if (field) setCaret(field.selectionStart ?? field.value.length);
  };

  // The edits chip: on until the designer takes it off, for this message.
  const [withEdits, setWithEdits] = useState(true);
  const editsCount = edits.styles + edits.texts;
  const editsGo = editsCount > 0 && withEdits && !action;

  // Words, files, an action, or any of them together; files upload first, so sending can take a moment.
  const [sending, setSending] = useState(false);
  // Props picked from the agent's `/props` list (see propLines.ts): a pick
  // writes its `name: value` line into the comment, nothing else (nothing
  // changes on the page, nothing goes yet); picking the page's value again
  // takes the line out. Sent, the comment's lines for the listed props go
  // with it, exact, typed or picked. A row shows its line's value.
  const propList = [...(thread?.messages ?? [])].reverse().find((m) => m.propList?.length)?.propList ?? [];
  const pageProps = currentProps?.() ?? {};
  // A props list is for the comment that answers it: once the designer wrote after it, its rows go (`/props` again for a new one).
  // `name: value` lines typed in the reply (the props list says how): sent with it, exact.
  const written = propList.length ? propsInText(text, propList) : {};
  const pendingProps: PropChange[] = action
    ? []
    : Object.entries(written)
        .filter(([name, to]) => String(to) !== String(pageProps[name]))
        .map(([name, to]) => ({ name, ...(name in pageProps ? { from: pageProps[name] } : {}), to }));

  const canSend = agentOn && !sending && (!!text.trim() || attachments.length > 0 || !!action || !!skill);
  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const outcome = await onSend(
      text.trim(),
      attachments.map((a) => a.file),
      action ?? undefined,
      // Read only when the text could mention something (reading the page takes a moment).
      /@|--/.test(text) ? mentionsIn(text, picked, pool ?? withProject(mentions?.() ?? [])) : [],
      editsGo,
      pendingProps,
      // Only with one: a comment without stays as it was.
      ...((skill ? [skill] : []) as [string?]),
    );
    setSending(false);
    if (outcome === false) return;
    // Not sent, and why: a red reply; the draft stays, to try again.
    if (typeof outcome === "object") return setFailed(outcome);
    setFailed(null);
    setText("");
    setAction(null);
    setSkill(null);
    setPicked([]);
    setWithEdits(true);
    for (const a of attachments) if (a.url) URL.revokeObjectURL(a.url);
    setAttachments([]);
    // The draft goes now: the box closes before its text change would reach App (onTextChange runs after the render).
    onTextChange?.("");
    // Sent: the box closes; the element's loader says it's with the agent, and its reply comes back to the thread.
    onClose();
  };

  // A one-click answer to the agent's question: sent as the designer's
  // message. The box closes then, as for a send, unless a draft is being
  // written (it stays, to finish).
  const answer = async (choice: string) => {
    if (!agentOn || sending) return;
    setSending(true);
    const outcome = await onSend(choice, []);
    setSending(false);
    if (outcome === "sent" && !text.trim() && !attachments.length && !action && !skill) onClose();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (mentionOpen && mention && e.target === fieldRef.current) {
      const n = mentionMatches.length;
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n) {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
        return;
      }
      if ((e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) && !e.isComposing && n) {
        e.preventDefault();
        pickMention(active);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // only the menu closes, not the box
        setDismissed(mention.start);
        return;
      }
    }
    if (menuOpen && e.target === fieldRef.current) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (menuCount) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + menuCount) % menuCount);
        return;
      }
      if ((e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) && !e.isComposing && menuCount) {
        e.preventDefault();
        pick(active);
        return;
      }
      if (e.key === "Escape" && slash) {
        e.preventDefault();
        e.stopPropagation(); // only the menu closes, not the box
        setSlashDismissed(slash.start);
        return;
      }
    }
    const field = fieldRef.current;
    if (e.key === "Backspace" && (action || skill) && e.target === field && field?.selectionStart === 0 && field.selectionEnd === 0) {
      e.preventDefault();
      setAction(null);
      setSkill(null);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter" && !e.isComposing && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      // Option+Enter resolves, like Mark as solved; Enter sends.
      if (e.altKey) resolve();
      else void send();
    }
  };

  const sendButton = (
    <button
      type="button"
      class="send"
      aria-label={agentOn ? "Send comment" : "Send comment: no agent connected"}
      disabled={!canSend}
      onClick={() => void send()}
    >
      <Icon name="arrow-up" />
    </button>
  );

  return (
    <PageAnchor at={dialogAnchor(spotNow, { left, top }, scroll)}>
      <div
        ref={ref}
        class="comment-widget"
        style={{ left: px(left), top: px(top) }}
        role="dialog"
        aria-label="Comment"
        data-dragging={dragging || undefined}
        data-veiled={veiled || undefined}
        data-dropping={dropping || undefined}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dropping && (
          <div class="drop-overlay" aria-hidden="true">
            <Icon name="attach-add" />
            <span>Drop to attach</span>
          </div>
        )}
        <div
          class="drag-handle"
          aria-hidden="true"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <Icon name="grip" />
        </div>
        {(count > 0 || status || shownError) && (
          // The thread scrolls inside its frame (up to 400px, less in a short
          // window), with fades at its edges and Pilot's scroll thumb.
          <div class="messages-frame">
            <div class="messages" ref={listRef} onScroll={measure}>
              {thread?.messages.map((m, i) =>
                m.from === "designer" ? (
                  <div key={m.at + m.from} class="message">
                    {m.attachments?.length ? (
                      <ul class="sent-images" aria-label="Attachments">
                        {m.attachments.map((file) => (
                          <li key={file.id} class="attachment" title={file.name}>
                            {file.thumb ? (
                              <img src={file.thumb} alt={file.name ?? "Image"} draggable={false} />
                            ) : (
                              <FileTile name={file.name ?? file.id} />
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {/* Chips are for writing: sent, an action or a skill reads as typed (`/responsive`, `/better-ui`), and the edits that went with it as words, in green. */}
                    {(m.text || m.action || m.skill || m.edits) && (
                      <p>
                        {m.action && <span class="mention">/{actionCommand(m.action)}</span>}
                        {!m.action && m.skill && <span class="mention">/{m.skill}</span>}
                        {m.edits ? (
                          <span class="mention">
                            {m.action || m.skill ? " " : ""}
                            {changesLabel(m.edits)}
                          </span>
                        ) : null}
                        {(m.action || m.skill || m.edits) && m.text ? " " : null}
                        {splitMentions(m.text, m.references).map((part, j) =>
                          part.mention ? (
                            <span key={j} class="mention">
                              {part.text}
                            </span>
                          ) : (
                            part.text
                          ),
                        )}
                      </p>
                    )}
                  </div>
                ) : (
                  <div key={m.at + m.from} class="agent-reply">
                    <div class="message" data-from="agent" aria-label={`${agentName ?? "Agent"}: ${m.text}`}>
                      {renderMarkdown(m.text)}
                      {/* The agent's reply to /props: a line per prop in its words' style, its value on the page, and how to change one. */}
                      {m.propList?.length ? <PropsList props={m.propList} current={pageProps} /> : null}
                      {/* The agent's question, not answered yet: its one-click answers (or write one), the agent's suggestion first. */}
                      {m.choices?.length && i === count - 1 ? (
                        <div class="choices" role="group" aria-label="Answers">
                          {m.choices.map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              class="choice"
                              disabled={!agentOn || sending}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => void answer(choice)}
                            >
                              {choice}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {/* The latest reply to a job that changed the look: adjust it by hand (not on a question, its answers are there, a props list, or Pilot's "Stopped"). And a reply whose run was refused something the designer can allow: the request for their agent, copied, never shown. */}
                      {(() => {
                        const adjust = onAdjust && i === count - 1 && m.restyled && !m.choices?.length && !m.propList && !m.early && !m.stopped;
                        return adjust || m.allow ? (
                          <div class="choices">
                            {adjust && (
                              <button type="button" class="choice" data-secondary onMouseDown={(e) => e.preventDefault()} onClick={onAdjust}>
                                Edit manually
                              </button>
                            )}
                            {m.allow && <CopyAllow text={m.allow} />}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                ),
              )}
              {/* Where the latest comment stands, as the reply to come, until the agent's real reply replaces it. */}
              {/* What's wrong (stuck, or a send that failed) in a red reply; else where the latest comment stands. */}
              {shownError ? (
                <p class="message" data-from="agent" data-error role="alert">
                  {shownError.title}. {shownError.detail}.
                </p>
              ) : (
                status && (
                  <p class="message" data-from="agent" data-pending role="status">
                    {status}…
                  </p>
                )
              )}
            </div>
            <div class="fade" data-edge="top" data-on={more.above || undefined} aria-hidden="true" />
            <div class="fade" data-edge="bottom" data-on={more.below || undefined} aria-hidden="true" />
            <ScrollThumb target={listRef} />
          </div>
        )}
        <div class="composer">
          {(action || skill || (editsCount > 0 && withEdits)) && (
            <div class="action-chip-row">
              {/* The editor's changes on the selection go with the comment (not with an action: they wait for Send). */}
              {editsCount > 0 && withEdits && !action && (
                <span class="action-chip" data-kind="edits" title="Your edits on this element, not sent yet, go with the comment">
                  {changesLabel(edits)}
                  <button
                    type="button"
                    class="action-remove"
                    aria-label={`Don't send the ${changesLabel(edits)} with the comment`}
                    onClick={() => {
                      setWithEdits(false);
                      fieldRef.current?.focus();
                    }}
                  >
                    <Icon name="close-small" />
                  </button>
                </span>
              )}
              {action && (
                <span class="action-chip">
                  {actionName(action)}
                  <button
                    type="button"
                    class="action-remove"
                    aria-label={`Remove ${actionName(action)}`}
                    onClick={() => {
                      setAction(null);
                      fieldRef.current?.focus();
                    }}
                  >
                    <Icon name="close-small" />
                  </button>
                </span>
              )}
              {/* A skill of the agent's, picked from the `/` list: its name, as the agent calls it, in an action's chip. */}
              {skill && (
                <span class="action-chip" data-kind="skill" title="Your agent uses this skill for the comment">
                  {skill}
                  <button
                    type="button"
                    class="action-remove"
                    aria-label={`Remove ${skill}`}
                    onClick={() => {
                      setSkill(null);
                      fieldRef.current?.focus();
                    }}
                  >
                    <Icon name="close-small" />
                  </button>
                </span>
              )}
            </div>
          )}
          {attachments.length > 0 && (
            <ul class="attachments" aria-label="Attachments">
              {attachments.map((a) => (
                <li key={a.id} class="attachment" title={a.file.name}>
                  {a.url ? <img src={a.url} alt={a.file.name} draggable={false} /> : <FileTile name={a.file.name} />}
                  <button type="button" class="detach" aria-label={`Remove ${a.file.name}`} onClick={() => detach(a)}>
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* The field and Pilot's scroll thumb over the box's edge, once it's past its 120px. */}
          <div class="field-frame">
            <textarea
              ref={fieldRef}
              class="field"
              data-reply={count > 0 || undefined}
              rows={1}
              value={text}
              placeholder={placeholder(!!action || !!skill, count > 0, !!mentions)}
              aria-label="Comment"
              onInput={(e) => {
                const field = e.currentTarget as HTMLTextAreaElement;
                setText(field.value);
                setCaret(field.selectionStart ?? field.value.length);
              }}
              onKeyUp={(e) => {
                if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") readCaret();
              }}
              onClick={readCaret}
              aria-controls={menuOpen ? "pilot-actions" : mentionOpen ? "pilot-mentions" : undefined}
              aria-activedescendant={
                menuOpen && options[active]
                  ? `pilot-action-${options[active].id}`
                  : menuOpen && skillOptions[active - options.length]
                    ? `pilot-skill-${active - options.length}`
                    : mentionOpen && mentionMatches[active]
                    ? `pilot-mention-${active}`
                    : undefined
              }
            />
            <ScrollThumb target={fieldRef} />
          </div>
          {mentionOpen && pool && (
            <div class="menu-frame">
            <div ref={menuRef} class="actions-menu" id="pilot-mentions" role="listbox" aria-label="Mention" onScroll={readMenuMore}>
              {mentionMatches.length ? (
                mentionMatches.map((o, i) => (
                  <Fragment key={o.group + o.label}>
                    {o.group !== mentionMatches[i - 1]?.group && (
                      <div class="mention-group" role="presentation">
                        {o.group}
                      </div>
                    )}
                    <div
                      id={`pilot-mention-${i}`}
                      class="action-option mention-option"
                      role="option"
                      aria-selected={i === active}
                      data-active={i === active || undefined}
                      onPointerEnter={() => setActive(i)}
                      // Keep focus in the field.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickMention(i)}
                    >
                      {o.swatch && <span class="mention-swatch color-preview" style={{ "--_color": o.swatch }} aria-hidden="true" />}
                      <span class="action-name">{o.label}</span>
                      {o.detail && <span class="action-description">{o.detail}</span>}
                    </div>
                  </Fragment>
                ))
              ) : (
                <div class="action-none">{pool.length ? "Nothing matches" : "Nothing to mention on this page"}</div>
              )}
            </div>
            {fades}
            </div>
          )}
          {menuOpen && (
            <div class="menu-frame">
            <div ref={menuRef} class="actions-menu" id="pilot-actions" role="listbox" aria-label="Skills" onScroll={readMenuMore}>
              {options.map((a, i) => (
                <div
                  key={a.id}
                  id={`pilot-action-${a.id}`}
                  class="action-option"
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active || undefined}
                  onPointerEnter={() => setActive(i)}
                  // Keep focus in the field.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(i)}
                >
                  <span class="action-head">
                    <span class="action-name">{a.name}</span>
                    <span class="action-author">{PILOT_AUTHOR}</span>
                  </span>
                  <span class="action-description">{a.description}</span>
                </div>
              ))}
              {/* The designer's skills, after Pilot's two: the same rows, each with its author in the corner when it says one. */}
              {skillOptions.map((s, i) => (
                <div
                  key={`skill-${s.name}`}
                  id={`pilot-skill-${i}`}
                  class="action-option"
                  data-kind="skill"
                  role="option"
                  aria-selected={options.length + i === active}
                  data-active={options.length + i === active || undefined}
                  onPointerEnter={() => setActive(options.length + i)}
                  // Keep focus in the field.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(options.length + i)}
                >
                  <span class="action-head">
                    <span class="action-name">{s.name}</span>
                    {s.author && <span class="action-author">{s.author}</span>}
                  </span>
                  {s.description && <span class="action-description">{s.description}</span>}
                </div>
              ))}
            </div>
            {fades}
            </div>
          )}
          {/* While a list is open (`/`, `@`), only it and the field show: picking is the next step, not sending or attaching. */}
          <div class="buttons" hidden={menuOpen || (mentionOpen && !!pool)}>
            <Tooltip text="Attach files" align="start">
              <button type="button" class="attach" aria-label="Attach files" onClick={() => fileRef.current?.click()}>
                <Icon name="attach" />
              </button>
            </Tooltip>
            <input
              ref={fileRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                const input = e.currentTarget as HTMLInputElement;
                attach(input.files);
                // So picking the same file again still counts as a change.
                input.value = "";
              }}
            />
            <div class="send-group">
              {/* The thread's job, while it can be taken back: stop it (as the loader's × does). */}
              {onStop && (
                <Tooltip text="Stop the job" align="end">
                  <button
                    type="button"
                    class="attach stop"
                    aria-label="Stop the job"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onStop}
                  >
                    <Icon name="stop" />
                  </button>
                </Tooltip>
              )}
              {agentOn ? (
                sendButton
              ) : (
                <Tooltip text="Pilot isn't running for this site" detail="Run npx usepilot in your project's folder" align="end">
                  {sendButton}
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        {thread && onResolve && (
          <div class="footer">
            <span class="hint">{RESOLVE_KEYS} to resolve</span>
            <button ref={resolveRef} type="button" class="resolve" onClick={resolve}>
              <Icon name="solved" />
              Mark as solved
            </button>
          </div>
        )}
      </div>
    </PageAnchor>
  );
}
