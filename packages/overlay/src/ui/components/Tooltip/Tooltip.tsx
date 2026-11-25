import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { px } from "../../px.ts";
import { onSwitch, openDelay, switched, tooltipClosed, tooltipOpened } from "./delay.ts";

interface TooltipProps {
  /** What the tooltip says. Empty: it doesn't open (a trigger that only sometimes has one keeps its place in the tree). */
  text: string;
  /** A second line, dimmed, under `text`: what to do about it ("Run npx usepilot in your project's folder"). */
  detail?: string;
  /** The trigger's keyboard shortcut, as it reads (`⌥C`, from `keyLabel()`): after `text`, dimmed. Not with a `detail`. */
  shortcut?: string;
  /** After `text`, dimmed, as a shortcut: what it stands for (a variable's value, `#ffffff`). Not with a `detail`. */
  aside?: string;
  /** Above the trigger (default), or below it when there's no room above. */
  side?: "top" | "bottom";
  /**
   * Centered on the trigger (default), or its left edge on the trigger's
   * (`start`) or its right edge (`end`), for a trigger at a panel's edge.
   */
  align?: "center" | "start" | "end";
  /** Space between the trigger and the tooltip, in px (default 4): more when the trigger sits inside a bar, so the tooltip clears the bar. */
  gap?: number;
  /** Show it now, whatever the pointer does (a moment of feedback: "Sent"). */
  forceOpen?: boolean;
  /** Fill the width it's given (a field), instead of hugging the trigger. */
  block?: boolean;
  /** The pointer came onto the trigger: a moment to work out what to say (whether a field's text is cut), before it opens. */
  onEnter?(): void;
  /** The trigger: a button, usually. Give it an `aria-label` of its own: the tooltip is visual only. */
  children: ComponentChildren;
}

/** How close a tooltip may come to the window's edges, in px: one that would go past moves along (a long stuck message on a loader near the edge). */
const EDGE = 8;
/** Space between the trigger and the tooltip, in px, unless the trigger says (`gap`). */
const GAP = 4;

/**
 * Where an open tooltip goes, in the window: above its trigger (or below),
 * centered on it (or its left or right edge on the trigger's), `gap` away;
 * then moved along to stay EDGE inside the window.
 */
export function placeTooltip(
  trigger: { left: number; right: number; top: number; bottom: number },
  size: { width: number; height: number },
  { side, align, gap }: { side: "top" | "bottom"; align: "center" | "start" | "end"; gap: number },
  window_ = { width: window.innerWidth, height: window.innerHeight },
): { left: number; top: number } {
  const left = align === "start" ? trigger.left : align === "end" ? trigger.right - size.width : (trigger.left + trigger.right) / 2 - size.width / 2;
  const top = side === "top" ? trigger.top - gap - size.height : trigger.bottom + gap;
  const clamp = (v: number, max: number) => Math.max(EDGE, Math.min(v, max - EDGE));
  return { left: clamp(left, window_.width - size.width), top: clamp(top, window_.height - size.height) };
}

/** `:focus-visible`, where the environment knows it (it doesn't in some test DOMs). */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

/**
 * Where `bubble` lands fixed at 0, 0 (viewport px), and its size there: the
 * window's corner, unless a container of it is moved (`translate`, a
 * transform, a filter), which then holds what's fixed inside it. Measured,
 * as the reasons a container does so are many. Its style is put back.
 */
function fixedOrigin(bubble: HTMLElement): { left: number; top: number; width: number; height: number } {
  const style = bubble.getAttribute("style");
  bubble.style.cssText = "position: fixed; left: 0; top: 0; right: auto; bottom: auto; margin: 0; translate: none";
  const { left, top } = bubble.getBoundingClientRect();
  const size = { width: bubble.offsetWidth, height: bubble.offsetHeight };
  if (style === null) bubble.removeAttribute("style");
  else bubble.setAttribute("style", style);
  return { left, top, ...size };
}

/**
 * A tooltip: shown, centered on its trigger, while the trigger is hovered or
 * has keyboard focus. 24px tall, 8px padding, 11px text, with the large
 * shadow (Tooltip.css). On hover, the
 * first one waits a moment; moving straight on to another opens it at once
 * (delay.ts). Keyboard focus opens it at once. Open, it's placed in the
 * window (`position: fixed`, placeTooltip), so a panel's scrolling list or
 * `overflow: hidden` never cuts it, and kept inside the window (EDGE). Use it
 * instead of `title` in Pilot's own UI.
 */
export function Tooltip({
  text,
  detail,
  shortcut,
  aside,
  side = "top",
  align = "center",
  gap,
  forceOpen = false,
  block = false,
  onEnter,
  children,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  // No transition (Tooltip.css) while moving between triggers: opened
  // straight after another one closed, or left for one that opened so.
  const [instant, setInstant] = useState(false);
  const isOpen = useRef(false);
  const hovered = useRef(false);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = (delay: number, warm = false) => {
    clearTimeout(timer.current);
    if (isOpen.current || !text) return;
    const go = () => {
      isOpen.current = true;
      tooltipOpened();
      setInstant(warm);
      setOpen(true);
      if (warm) switched(dropFade.current);
    };
    if (delay > 0) timer.current = setTimeout(go, delay);
    else go();
  };
  const hide = () => {
    if (hovered.current || focused.current) return;
    clearTimeout(timer.current);
    if (!isOpen.current) return;
    isOpen.current = false;
    tooltipClosed();
    // Fades out, unless the pointer is on its way to another trigger (dropFade).
    setInstant(false);
    setOpen(false);
  };
  // Another tooltip opened at once: if this one is closing, it's gone at once.
  const dropFade = useRef(() => {
    if (!isOpen.current) setInstant(true);
  });
  useEffect(() => onSwitch(dropFade.current), []);

  // Open, it's placed in the window (fixed), from its trigger: a panel's scrolling list or its
  // `overflow: hidden` can't cut it (a field's long value at the dialog's left edge). Kept
  // inside the window, and following the trigger while the page or its list scrolls. Kept
  // where it was while it fades out.
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null);
  const shown = (open || forceOpen) && !!text;
  useLayoutEffect(() => {
    if (!shown) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const b = bubble.current;
      if (!a || !b) return;
      const origin = fixedOrigin(b);
      const placed = placeTooltip(a, origin, { side, align, gap: gap ?? GAP });
      // From where `fixed` starts for it: the window's corner, or a container's that is moved
      // (`translate`, a transform: the toolbar, centered so), which holds what's fixed inside it.
      const next = { left: placed.left - origin.left, top: placed.top - origin.top };
      setSpot((s) => (s && Math.abs(s.left - next.left) < 0.5 && Math.abs(s.top - next.top) < 0.5 ? s : next));
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [shown, text, detail, side, align, gap]);

  // Something to say now, with the pointer already on the trigger (a field's
  // value just turned into math): it opens as if the pointer had just come.
  useEffect(() => {
    if (text && hovered.current) show(openDelay());
  }, [!text]);

  // Going away while open (the selection changed): it counts as closed.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (isOpen.current) tooltipClosed();
    },
    [],
  );

  return (
    <span
      ref={anchor}
      class="tooltip-anchor"
      data-block={block || undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === "touch") return;
        hovered.current = true;
        onEnter?.();
        const delay = openDelay();
        show(delay, delay === 0);
      }}
      onPointerLeave={() => {
        hovered.current = false;
        hide();
      }}
      onFocusIn={(e) => {
        if (!focusVisible(e.target as Element)) return;
        focused.current = true;
        show(0);
      }}
      onFocusOut={() => {
        focused.current = false;
        hide();
      }}
    >
      {children}
      <span
        ref={bubble}
        class="tooltip"
        data-side={side}
        data-align={align === "center" ? undefined : align}
        data-open={((open || forceOpen) && !!text) || undefined}
        data-instant={instant || undefined}
        data-detail={detail ? "" : undefined}
        style={
          spot
            ? { position: "fixed", left: px(spot.left), top: px(spot.top), right: "auto", bottom: "auto", margin: "0", translate: "none" }
            : gap === undefined
              ? undefined
              : side === "top"
                ? { marginBottom: px(gap) }
                : { marginTop: px(gap) }
        }
        aria-hidden="true"
      >
        {detail ? (
          <>
            <span class="title">{text}</span>
            <span class="detail">{detail}</span>
          </>
        ) : shortcut || aside ? (
          <>
            {text}
            <span class="shortcut">{shortcut || aside}</span>
          </>
        ) : (
          text
        )}
      </span>
    </span>
  );
}
