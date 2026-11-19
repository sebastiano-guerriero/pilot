import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { ScrollThumb } from "../ScrollThumb/ScrollThumb.tsx";
import { scrollWithin } from "../../../dom/reveal.ts";

interface PropertySelectProps {
  /** The value set on the element (e.g. "grid"), or "" when none is: the trigger then says "Select", dimmed. */
  value: string;
  /** The values to pick from, in menu order. */
  options: readonly string[];
  /** Accessible name, e.g. "display". */
  label: string;
  /** What the trigger says with no value: "Select" by default ("Mixed" when the selected elements differ). */
  placeholder?: string;
  /** The trigger button, so the editor can focus it (e.g. from the search). */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** The designer picked a value, or "" to remove it (Backspace/Delete on the trigger). */
  onChange(value: string): void;
  /** Tab (1) or Shift+Tab (-1): move to the next/previous field. */
  onTab?(direction: 1 | -1): void;
  /**
   * Offer "Select" (no value) as the first option, and let Backspace/Delete
   * remove the value. Default true. False for selects that always have a
   * value (the columns mode, which defaults to repeat).
   */
  clearable?: boolean;
  /**
   * The icon variant: an icon for each value (12px, 6px before the text), on
   * the trigger and on every option. Called with "" for the "Select" state
   * (nothing set). Values without one keep an empty slot, so labels line up.
   */
  iconFor?(value: string): ComponentChildren;
}

/** The menu's padding: its options line up with the trigger once it's moved left by this. */
const MENU_PADDING = 4;
/** Closest the menu gets to the viewport's edges. */
const EDGE = 8;
/** How long typed letters keep adding to the type-ahead search. */
const TYPEAHEAD_MS = 500;

/**
 * Keyword control in an editor row: a trigger drawn as the same 24px box as
 * PropertyInputText (`.field-box`, base.css), filling its slot in PropertyRow's
 * value area, and Pilot's own dropdown menu. It's a select-only combobox
 * (WAI-ARIA): focus stays on the trigger, and the highlighted option is its
 * `aria-activedescendant`.
 *
 * - Closed: typing picks, like a native select (`f` → flex, `i` again →
 *   the next option starting with i); Enter, Space, ↑ or ↓ open the menu (on
 *   the current value); Backspace/Delete remove the value; Tab moves on; Esc
 *   goes to the dialog.
 * - Open: ↑/↓, Home/End and typing move the highlight; Enter or Space picks;
 *   Esc closes without picking; Tab closes and moves on. Hovering highlights,
 *   clicking picks. Focus stays on the trigger, so Tab continues from here.
 *
 * The menu is `position: fixed`, so the dialog's `overflow: hidden` doesn't
 * clip it. Like macOS's native select, it opens over the trigger, with the
 * current value's option on top of it and the two labels lined up (see
 * `menuPosition`). The first option, "Select" (dimmed), means no value: picking
 * it removes the value. A value that isn't in `options` (set some other way)
 * is still listed, right after it.
 */
export function PropertySelect({
  value,
  options,
  label,
  triggerRef,
  onChange,
  onTab,
  clearable = true,
  iconFor,
  placeholder = "Select",
}: PropertySelectProps) {
  // "" is the "Select" option: no value.
  const list = [...(clearable ? [""] : []), ...(value && !options.includes(value) ? [value] : []), ...options];
  const ownRef = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? ownRef;
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const optionId = (index: number) => `${id}-option-${index}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const show = () => {
    setActive(Math.max(0, list.indexOf(value)));
    setPosition(null);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const choose = (index: number) => {
    close();
    const next = list[index];
    if (next !== undefined && next !== value) onChange(next);
  };

  // Place the menu before it's painted: over the trigger, with the current
  // value's option on top of it and its label where the trigger's is.
  useLayoutEffect(() => {
    if (!open || position || !trigger.current || !menu.current) return;
    const m = menu.current;
    const t = trigger.current.getBoundingClientRect();
    const current = m.querySelector<HTMLElement>(`[data-index="${Math.max(0, list.indexOf(value))}"]`);
    // How much further in an option's label starts than the trigger's (the
    // checkmark column): the menu grows leftward by that much.
    const inset = (box: Element | null | undefined, text: Element | null | undefined) =>
      box && text ? text.getBoundingClientRect().left - box.getBoundingClientRect().left : 0;
    const labelShift = Math.max(
      0,
      inset(current, current?.querySelector(".label")) - inset(trigger.current, trigger.current.querySelector(".value")),
    );
    const minWidth = t.width + labelShift + 2 * MENU_PADDING;
    m.style.minWidth = px(minWidth); // measure at the size it'll have
    scrollWithin(m, current); // a long list scrolls to it first (the list only: dom/reveal.ts)
    setPosition({
      minWidth,
      ...menuPosition({
        trigger: t,
        menu: { width: m.offsetWidth, height: m.offsetHeight },
        optionTop: (current?.offsetTop ?? MENU_PADDING) - m.scrollTop,
        labelShift,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }),
    });
  }, [open, position]);

  // Keep the highlighted option in view when the list scrolls.
  useEffect(() => {
    if (open) scrollWithin(menu.current, menu.current?.querySelector(`[data-index="${active}"]`));
  }, [open, active]);

  // The page moved under the menu: close it rather than leave it floating.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);

  // Type-ahead (see `typeaheadMatch`): open, it moves the highlight; closed,
  // it picks right away, like a native select.
  const typed = useRef({ text: "", at: 0 });
  const typeahead = (char: string) => {
    const now = Date.now();
    const text = (now - typed.current.at < TYPEAHEAD_MS ? typed.current.text : "") + char.toLowerCase();
    typed.current = { text, at: now };
    const index = typeaheadMatch(list, text, open ? active : Math.max(0, list.indexOf(value)));
    if (index < 0) return;
    if (open) setActive(index);
    else if (list[index] !== value) onChange(list[index] as string);
  };
  const isTypeahead = (e: KeyboardEvent) => e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      close();
      onTab?.(e.shiftKey ? -1 : 1);
      return;
    }
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        show();
      } else if ((e.key === "Backspace" || e.key === "Delete") && value && clearable) {
        e.preventDefault();
        onChange("");
      } else if (isTypeahead(e)) {
        e.preventDefault();
        typeahead(e.key);
      }
      return; // Esc bubbles to the dialog: back to the search.
    }
    const last = list.length - 1;
    if (e.key === "ArrowDown") setActive((i) => Math.min(last, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape") {
      e.stopPropagation(); // only close the menu, don't leave the editor
      close();
    } else if (isTypeahead(e)) typeahead(e.key);
    else return;
    e.preventDefault();
  };

  return (
    <div class="property-select">
      <button
        ref={trigger}
        type="button"
        class="trigger field-box"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        onBlur={close}
      >
        {iconFor && <span class="option-icon">{iconFor(value)}</span>}
        {value ? <span class="value">{value}</span> : <span class="value placeholder">{placeholder}</span>}
        <Icon name="chevron-down" class="chevron" />
      </button>
      {open && (
        // The menu's box (placed, not scrolling), the list that scrolls inside it, and Pilot's scroll thumb over its edge.
        <div
          class="menu"
          style={
            position
              ? { left: px(position.left), top: px(position.top), minWidth: px(position.minWidth) }
              : { visibility: "hidden" }
          }
          // Clicking an option mustn't take focus from the trigger (that would close the menu first).
          onMouseDown={(e) => e.preventDefault()}
        >
        <div ref={menu} id={`${id}-menu`} class="menu-list" role="listbox" aria-label={label}>
          {list.map((option, index) => (
            <div
              key={option || "\u0000"}
              id={optionId(index)}
              class="option"
              role="option"
              aria-selected={option === value}
              data-index={index}
              data-active={index === active || undefined}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span class="check">{option === value && <Icon name="check" />}</span>
              <span class="content">
                {iconFor && <span class="option-icon">{iconFor(option)}</span>}
                <span class={option ? "label" : "label placeholder"}>{option || "Select"}</span>
              </span>
            </div>
          ))}
        </div>
        <ScrollThumb target={menu} />
        </div>
      )}
    </div>
  );
}

/**
 * The option type-ahead lands on, from the one at `from` (the current value,
 * or the highlighted option), or -1 for none. Like native selects:
 * - one letter, or the same letter repeated (`i`, `ii`), cycles through the
 *   options starting with it, from the one after `from` (inline-block →
 *   inline → inline-flex…);
 * - several letters (`inl`) find the first option starting with them, from
 *   `from` itself, so the match narrows without jumping away.
 * The "Select" option ("") never matches.
 */
export function typeaheadMatch(list: readonly string[], text: string, from: number): number {
  if (!text) return -1;
  const first = text[0] as string;
  const cycling = [...text].every((c) => c === first);
  const search = cycling ? first : text;
  const start = cycling ? from + 1 : from;
  for (let k = 0; k < list.length; k++) {
    const i = (start + k) % list.length;
    const option = list[i];
    if (option && option.startsWith(search)) return i;
  }
  return -1;
}

interface MenuPosition {
  left: number;
  top: number;
  /** The trigger's width, plus the label shift and the menu's padding. */
  minWidth: number;
}

/**
 * Where the menu goes, macOS-style: the option at `optionTop` (its offset
 * inside the menu) sits exactly over the trigger, and the menu is moved left
 * by its padding plus `labelShift` (how much further in an option's label
 * starts than the trigger's), so the option's label lands where the trigger's
 * is. With the menu at least that much wider, the options' right edges line up
 * with the trigger's. Kept inside the viewport (then the option no longer
 * covers the trigger exactly).
 */
export function menuPosition({
  trigger,
  menu,
  optionTop,
  labelShift = 0,
  viewport,
}: {
  trigger: { left: number; top: number };
  menu: { width: number; height: number };
  optionTop: number;
  labelShift?: number;
  viewport: { width: number; height: number };
}): { left: number; top: number } {
  const clamp = (value: number, max: number) => Math.max(EDGE, Math.min(value, max));
  return {
    left: clamp(trigger.left - MENU_PADDING - labelShift, viewport.width - EDGE - menu.width),
    top: clamp(trigger.top - optionTop, viewport.height - EDGE - menu.height),
  };
}
