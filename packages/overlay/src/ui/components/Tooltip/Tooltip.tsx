import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { px } from "../../px.ts";
import { onSwitch, openDelay, switched, tooltipClosed, tooltipOpened } from "./delay.ts";

interface TooltipProps {
  /** What the tooltip says. */
  text: string;
  /** Above the trigger (default), or below it when there's no room above. */
  side?: "top" | "bottom";
  /** Space between the trigger and the tooltip, in px (default 4): more when the trigger sits inside a bar, so the tooltip clears the bar. */
  gap?: number;
  /** Show it now, whatever the pointer does (a moment of feedback: "Sent"). */
  forceOpen?: boolean;
  /** The trigger: a button, usually. Give it an `aria-label` of its own: the tooltip is visual only. */
  children: ComponentChildren;
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
 * A tooltip: shown, centered on its trigger, while the trigger is hovered or
 * has keyboard focus. 22px tall, 6px padding, 11px text, with the large
 * shadow (Tooltip.css). On hover, the
 * first one waits a moment; moving straight on to another opens it at once
 * (delay.ts). Keyboard focus opens it at once. Use it instead of `title` in
 * Pilot's own UI.
 */
export function Tooltip({ text, side = "top", gap, forceOpen = false, children }: TooltipProps) {
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
    if (isOpen.current) return;
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
      class="tooltip-anchor"
      onPointerEnter={(e) => {
        if (e.pointerType === "touch") return;
        hovered.current = true;
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
        class="tooltip"
        data-side={side}
        data-open={open || forceOpen || undefined}
        data-instant={instant || undefined}
        style={gap === undefined ? undefined : side === "top" ? { marginBottom: px(gap) } : { marginTop: px(gap) }}
        aria-hidden="true"
      >
        {text}
      </span>
    </span>
  );
}
