import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { MIXED } from "../../../editors/declared.ts";
import type { FocusRequest } from "../../../editors/types.ts";
import { Icon } from "../Icon/Icon.tsx";
import { PropertyPanel } from "../PropertyPanel/PropertyPanel.tsx";
import { PropertyRow } from "../PropertyRow/PropertyRow.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

/** One chip: what it is (`linear`, `blur`), an optional value after it, dimmed (`4px`), and a preview before it. */
export interface LayerItem {
  name: string;
  hint?: string;
  swatch?: ComponentChildren;
  /** Shown on hover (and keyboard focus): its whole value, when the chip can't show all of it. */
  tooltip?: string;
}

interface LayerListProps {
  /** The row's label: `mask-image`, `filter`. */
  label: string;
  /** Extra class names on the row. */
  class?: string;
  items: LayerItem[];
  /** The selected elements differ: a "Mixed" box instead of chips. */
  mixed?: boolean;
  /** The item whose panel is open, or null. */
  open: number | null;
  onOpen(index: number | null): void;
  onAdd(): void;
  /** No + (default: one): the value is `none`, the whole value, so another item couldn't join it. */
  noAdd?: boolean;
  onRemove(index: number): void;
  /** What an item is called, for screen readers: `mask` → "Edit mask: linear", "Remove mask", "Add a mask". */
  noun: string;
  /** The panel's title: "Mask Image". */
  panelTitle: string;
  focusRequest?: FocusRequest;
  /** The open item's rows, in the panel. */
  children?: ComponentChildren;
  /** The open item's help, in the panel's footer. */
  footer?: ComponentChildren;
}

/**
 * A property made of a list of things, each edited in a panel (mask-image's
 * masks, filter's functions; the owner's design, from mask-image): the row
 * lists them as chips (a preview, the name, a dimmed value, × to take it
 * off) and a + under them that adds one; the label sits on the first chip's
 * line. A chip opens its panel (PropertyPanel) beside the dialog; closed, the
 * focus goes back to the chip. The panel closes on its own when its item
 * goes (undone, taken off).
 */
export function LayerList({
  label,
  class: className,
  items,
  mixed,
  open,
  onOpen,
  onAdd,
  noAdd = false,
  onRemove,
  noun,
  panelTitle,
  focusRequest,
  children,
  footer,
}: LayerListProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusRequest) firstRef.current?.focus();
  }, [focusRequest]);

  const close = (replaced = false) => {
    const at = open;
    onOpen(null);
    // Focus back where the panel was opened from (not when another panel opened: it has the focus).
    if (!replaced) requestAnimationFrame(() => rowRef.current?.querySelectorAll<HTMLElement>(".layer-chip-open")[at ?? 0]?.focus());
  };

  const hasOpen = open !== null && open < items.length;
  // Its item undone away (or taken off elsewhere): the panel closes.
  useEffect(() => {
    if (open !== null && !hasOpen) onOpen(null);
  }, [open, hasOpen]);

  // A chip's main part: it opens the panel.
  const openButton = (item: LayerItem, i: number) => (
    <button
      type="button"
      class="layer-chip-open"
      ref={i === 0 ? firstRef : undefined}
      aria-label={`Edit ${noun}: ${item.name}`}
      onClick={() => onOpen(open === i ? null : i)}
    >
      {item.swatch}
      <span class="layer-chip-name">
        {item.name}
        {item.hint && <span class="layer-chip-hint">{item.hint}</span>}
      </span>
    </button>
  );

  return (
    <PropertyRow label={label} class={className ? `layer-list-row ${className}` : "layer-list-row"}>
      <div class="layer-list" ref={rowRef}>
        {mixed && <span class="layer-mixed field-box">{MIXED}</span>}
        {items.map((item, i) => (
          <div key={i} class="layer-chip field-box" data-open={open === i || undefined}>
            {item.tooltip ? (
              // Below, its right edge on the chip's: above, the first row's would be cut by the dialog's list
              // (under the chips there's always the +), and it's wider than the chip, so it grows over the label.
              <Tooltip text={item.tooltip} block align="end" side="bottom">
                {openButton(item, i)}
              </Tooltip>
            ) : (
              openButton(item, i)
            )}
            <button type="button" class="layer-chip-remove" aria-label={`Remove ${noun}`} onClick={() => onRemove(i)}>
              <Icon name="close-small" />
            </button>
          </div>
        ))}
        {!noAdd && (
          <button type="button" class="layer-add" ref={items.length || mixed ? undefined : firstRef} aria-label={`Add a ${noun}`} onClick={onAdd}>
            <Icon name="plus" />
          </button>
        )}
      </div>
      {hasOpen && children && (
        <PropertyPanel
          title={panelTitle}
          beside={() => rowRef.current?.closest(".property-dialog")?.getBoundingClientRect() ?? null}
          anchor={() => rowRef.current?.closest(".property-row")?.getBoundingClientRect() ?? null}
          onClose={close}
          footer={footer}
        >
          {children}
        </PropertyPanel>
      )}
    </PropertyRow>
  );
}
