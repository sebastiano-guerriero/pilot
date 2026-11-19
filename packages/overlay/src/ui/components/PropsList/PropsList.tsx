import type { PropSpec, PropValue } from "@pilot/protocol";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { PropertyInputText } from "../PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../PropertySelect/PropertySelect.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

interface PropsListProps {
  /** The component's props, as the agent listed them (`/props`). */
  props: PropSpec[];
  /** The instance's props now, read from the page (see componentProps): each row shows its value. */
  current: Record<string, PropValue>;
  /** Values picked and not on the page yet (the comment box keeps them): a row shows its pick over the page's value. */
  picked?: Record<string, PropValue>;
  /** The designer picked a value: it joins the comment being written (nothing changes on the page, nothing goes yet). */
  onPick?(name: string, value: PropValue): void;
}

/**
 * The agent's reply to `/props`, in the thread: a row per prop, built from
 * the property dialog's pieces (PropertyRow, PropertySelect,
 * PropertyInputText): a select for one of a set of values or an on-off
 * prop, a field for a text or a number. A row shows the instance's value
 * on the page (else the prop's default), or what the designer picked: a
 * pick only joins the comment being written, and goes with it when it's
 * sent (the agent sets it in the code; hot reload brings it). Placeholder
 * layout, pending the design.
 */
export function PropsList({ props, current, picked = {}, onPick }: PropsListProps) {
  const shown = (p: PropSpec): string => {
    const value = p.name in picked ? picked[p.name] : (current[p.name] ?? p.default);
    return value === undefined ? "" : String(value);
  };
  const set = (p: PropSpec, text: string) => {
    if (!text || text === shown(p)) return;
    const to: PropValue =
      p.type === "boolean" ? text === "true" : p.type === "number" && Number.isFinite(Number(text)) ? Number(text) : text;
    onPick?.(p.name, to);
  };
  return (
    <div class="props-list" role="group" aria-label="Props">
      {props.map((p) => (
        <PropertyRow key={p.name} label={<PropName name={p.name} description={p.description} />}>
          {p.type === "options" || p.type === "boolean" ? (
            <PropertySelect
              label={p.name}
              value={shown(p)}
              options={p.type === "boolean" ? ["true", "false"] : (p.options ?? [])}
              clearable={false}
              onChange={(value) => set(p, value)}
            />
          ) : (
            <PropertyInputText label={p.name} value={shown(p)} onCommit={(text) => set(p, text.trim())} />
          )}
        </PropertyRow>
      ))}
    </div>
  );
}

/**
 * A prop's name in its row, cut with an ellipsis when it doesn't fit; the
 * whole name in a tooltip then, and the agent's description of it (when
 * it gave one) as the tooltip's second line.
 */
function PropName({ name, description }: { name: string; description?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setCut(el.scrollWidth > el.clientWidth);
  });
  const shown = (
    <span ref={ref} class="prop-name">
      {name}
    </span>
  );
  if (!cut && !description) return shown;
  return (
    <Tooltip text={name} detail={description} align="start">
      {shown}
    </Tooltip>
  );
}
