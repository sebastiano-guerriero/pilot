import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { CommentThread } from "../../../bridge/session.ts";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { dialogPosition, dialogSpot, raisedSpot } from "../PropertyDialog/PropertyDialog.tsx";

/** How sending went: to the agent, its prompt copied (no agent on the page), or not at all. */
export type CommentOutcome = "sent" | "copied" | false;

interface CommentWidgetProps {
  element: Element;
  /** The element's box (viewport px), to open beside it. */
  anchor: DOMRect;
  /** The element's thread, once it has one. */
  thread: CommentThread | null;
  /** Where its latest comment stands, in words ("Waiting for an agent"), if it isn't done. */
  status?: string;
  /** Who replies ("Claude Code · app"), for the agent's messages. */
  agentName?: string;
  onSend(text: string): Promise<CommentOutcome> | CommentOutcome;
  /** The designer is done with the thread: it goes, with its pin. */
  onResolve?(): void;
  onClose(): void;
  /** Take focus when it opens (not when the selection came from the DOM tree, which keeps it). */
  autoFocus?: boolean;
}

/** The longest the field grows to before it scrolls, in px. */
const FIELD_MAX = 120;

/**
 * The Comment tool's panel, beside the selected element where the property
 * dialog would be (and placed the same way: picked once, moves with the
 * page, never jumps while you type, draggable by its top strip): the
 * element's thread (the designer's comments, the agent's replies), where
 * the latest stands, and a field to write the next one.
 * - Enter sends (at once, to the agent working on the page; with none, its
 *   prompt is copied), Shift+Enter starts a new line, Esc closes.
 * - Resolve ends the thread. Placeholder look, pending the design.
 */
export function CommentWidget({
  element,
  anchor,
  thread,
  status,
  agentName,
  onSend,
  onResolve,
  onClose,
  autoFocus = true,
}: CommentWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

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
  useLayoutEffect(() => {
    if (spot || !ref.current) return;
    const box = element.isConnected ? element.getBoundingClientRect() : anchor;
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

  const drag = useRef<{ x: number; y: number; from: { left: number; top: number } } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onDragStart = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, from: { left: left + scroll.x, top: top + scroll.y } };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const shown = dialogPosition({ left: d.from.left + e.clientX - d.x, top: d.from.top + e.clientY - d.y }, size, { width: vw, height: vh }, scroll);
    setSpot({ left: shown.left + scroll.x, top: shown.top + scroll.y });
  };
  const onDragEnd = () => {
    drag.current = null;
    setDragging(false);
  };

  useEffect(() => {
    if (autoFocus) fieldRef.current?.focus();
  }, []);
  // The latest message in view.
  const count = thread?.messages.length ?? 0;
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [count]);
  // "Prompt copied" for a moment.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  // The field grows with its text, up to FIELD_MAX.
  const fit = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = px(Math.min(field.scrollHeight, FIELD_MAX));
  };
  useLayoutEffect(fit, [text]);

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    const outcome = await onSend(value);
    if (outcome === false) return;
    setText("");
    if (outcome === "copied") setCopied(true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const note = copied ? "Prompt copied: paste it in your agent's chat." : status;

  return (
    <div
      ref={ref}
      class="comment-widget"
      style={{ left: px(left), top: px(top) }}
      role="dialog"
      aria-label="Comment"
      data-dragging={dragging || undefined}
      onKeyDown={onKeyDown}
    >
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
      {count > 0 && (
        <div class="messages" ref={listRef}>
          {thread?.messages.map((m) => (
            <div key={m.at + m.from} class="message" data-from={m.from}>
              <span class="author">{m.from === "designer" ? "You" : (agentName ?? "Agent")}</span>
              <p class="text">{m.text}</p>
            </div>
          ))}
        </div>
      )}
      {note && (
        <div class="status" role="status">
          {note}
        </div>
      )}
      <div class="composer">
        <textarea
          ref={fieldRef}
          class="field"
          rows={1}
          value={text}
          placeholder={count ? "Reply…" : "Comment for the agent…"}
          aria-label="Comment"
          onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
        />
        <button type="button" class="send" aria-label="Send comment" disabled={!text.trim()} onClick={() => void send()}>
          <Icon name="send" />
        </button>
      </div>
      {thread && onResolve && (
        <div class="footer">
          <span class="hint">Shift+Enter for a new line</span>
          <button type="button" class="resolve" onClick={onResolve}>
            Resolve
          </button>
        </div>
      )}
    </div>
  );
}
