import { ATTACHMENT_ACCEPT, attachmentKind, attachmentType, type CommentAction } from "@pilot/protocol";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { CommentThread } from "../../../bridge/session.ts";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { dialogPosition, dialogSpot, raisedSpot } from "../PropertyDialog/PropertyDialog.tsx";
import { ScrollThumb } from "../ScrollThumb/ScrollThumb.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { actionName, isActionQuery, matchActions } from "./actions.ts";
import { renderMarkdown } from "./markdown.tsx";

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
  anchor: DOMRect;
  /**
   * The element the spot is picked beside, when it isn't `element`: with
   * several selected, the latest one (App). Picked again when it changes,
   * so the panel follows the last element added.
   */
  placeBy?: Element;
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
  /** An agent is on the page: without one, the send button is disabled (comments go to an agent only). */
  agentOn?: boolean;
  /** Who replies ("Claude Code · app"), for the agent's messages. */
  agentName?: string;
  /**
   * Sends the comment: its words, the files attached, and the action picked
   * from the `/` menu (Make responsive); any of them may be missing, but
   * not all.
   */
  onSend(text: string, files: File[], action?: CommentAction): Promise<CommentOutcome> | CommentOutcome;
  /** The designer is done with the thread: it goes. `from` is Mark as solved's box (for its confetti). */
  onResolve?(from?: DOMRect): void;
  onClose(): void;
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
  thread,
  status,
  error,
  agentName,
  onSend,
  onResolve,
  onClose,
  autoFocus = true,
  agentOn = true,
}: CommentWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const resolveRef = useRef<HTMLButtonElement>(null);
  const resolve = () => onResolve?.(resolveRef.current?.getBoundingClientRect());
  const [text, setText] = useState("");
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
  const scroll = { x: window.scrollX, y: window.scrollY };
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
  const { left, top } = dialogPosition(spot ?? dialogSpot(anchor, size.width, vw, scroll), size, { width: vw, height: vh }, scroll);
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

  // The `/` menu: `/` at the start of the message lists the actions (see
  // actions.ts), filtered by what follows. ↑/↓ move, Enter or Tab picks
  // (the action becomes a chip, and what's typed next goes with it), Esc
  // closes it by clearing the `/…` text. Backspace at the start of the
  // field removes the chip.
  const [action, setAction] = useState<CommentAction | null>(null);
  const menuOpen = !action && isActionQuery(text);
  const options = menuOpen ? matchActions(text) : [];
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [text]);
  const pick = (index: number) => {
    const chosen = options[index];
    if (!chosen) return;
    setAction(chosen.id);
    setText("");
    fieldRef.current?.focus();
  };

  // Words, files, an action, or any of them together; files upload first, so sending can take a moment.
  const [sending, setSending] = useState(false);
  const canSend = agentOn && !sending && !menuOpen && (!!text.trim() || attachments.length > 0 || !!action);
  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const outcome = await onSend(
      text.trim(),
      attachments.map((a) => a.file),
      action ?? undefined,
    );
    setSending(false);
    if (outcome === false) return;
    // Not sent, and why: a red reply; the draft stays, to try again.
    if (typeof outcome === "object") return setFailed(outcome);
    setFailed(null);
    setText("");
    setAction(null);
    for (const a of attachments) if (a.url) URL.revokeObjectURL(a.url);
    setAttachments([]);
  };

  // A one-click answer to the agent's question: sent as the designer's message (the draft stays).
  const answer = async (choice: string) => {
    if (!agentOn || sending) return;
    setSending(true);
    await onSend(choice, []);
    setSending(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (menuOpen && e.target === fieldRef.current) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (options.length) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        return;
      }
      if ((e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) && !e.isComposing) {
        e.preventDefault();
        pick(active);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // only the menu closes, not the box
        setText("");
        return;
      }
    }
    const field = fieldRef.current;
    if (e.key === "Backspace" && action && e.target === field && field?.selectionStart === 0 && field.selectionEnd === 0) {
      e.preventDefault();
      setAction(null);
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
    <div
      ref={ref}
      class="comment-widget"
      style={{ left: px(left), top: px(top) }}
      role="dialog"
      aria-label="Comment"
      data-dragging={dragging || undefined}
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
                  {m.action && <span class="action-chip">{actionName(m.action)}</span>}
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
                  {m.text && <p>{m.text}</p>}
                </div>
              ) : (
                <div key={m.at + m.from} class="message" data-from="agent" aria-label={`${agentName ?? "Agent"}: ${m.text}`}>
                  {renderMarkdown(m.text)}
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
        {action && (
          <div class="action-chip-row">
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
        <textarea
          ref={fieldRef}
          class="field"
          data-reply={count > 0 || undefined}
          rows={1}
          value={text}
          placeholder={action ? "Add details (optional)" : count ? "Reply, or / for actions" : "Ask the agent, or / for actions"}
          aria-label="Comment"
          onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
          aria-controls={menuOpen ? "pilot-actions" : undefined}
          aria-activedescendant={menuOpen && options[active] ? `pilot-action-${options[active].id}` : undefined}
        />
        {menuOpen && (
          <div class="actions-menu" id="pilot-actions" role="listbox" aria-label="Actions">
            {options.length ? (
              options.map((a, i) => (
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
                  <span class="action-name">{a.name}</span>
                  <span class="action-description">{a.description}</span>
                </div>
              ))
            ) : (
              <div class="action-none">No action matches</div>
            )}
          </div>
        )}
        <div class="buttons">
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
          {agentOn ? (
            sendButton
          ) : (
            <Tooltip text="No agent connected" align="end">
              {sendButton}
            </Tooltip>
          )}
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
  );
}
