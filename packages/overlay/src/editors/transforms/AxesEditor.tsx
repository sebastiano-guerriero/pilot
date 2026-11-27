import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { stepValue } from "../../css/values.ts";
import { Icon } from "../../ui/components/Icon/Icon.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { Tooltip } from "../../ui/components/Tooltip/Tooltip.tsx";
import { declaredOf, isMixed, MIXED } from "../declared.ts";
import { normalizeQuery } from "../query.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import { AXES, type Axis, axesValue, axisVar, isAxesValue, parseAxis, parseTransform, type TransformProperty } from "./axes.ts";
import { usePerspectiveHint } from "./perspective.tsx";

/** How translate or scale differ in the shared editor. */
interface AxesConfig {
  property: TransformProperty;
  label: string;
  /** Tailwind's classes for it (`translate-x-4`, `scale-50`…). */
  aliases: string[];
  /** What a field shows when it's empty: no move, no scaling. */
  placeholder: string;
  /** The axes that move it in 3D, which need a perspective on the parent to show (translate's Z). */
  depth?: readonly Axis[];
}

type View = "one" | "axes";

/**
 * What an empty field (or `none`) steps and drags from: no move, no scaling. So ↑, the wheel or a drag on an
 * empty translate field gives 1px or -1px, by its direction; scale's from 1 (its kind's own, css/values.ts).
 */
const FROM: Record<TransformProperty, string> = { translate: "0px", scale: "1" };

/**
 * translate and scale (axes.ts), rotate's way (RotateEditor): one value, or
 * split into X, Y and Z, switched by the button at the right of the row.
 * - One value: the property as typed (`10px 20px`, `1.5`, `none`), stepped
 *   and dragged when it's one part.
 * - Split: a field per axis, each its own entry, written as a variable plus
 *   the property combining them, the page's own axes kept (axes.ts). Empty
 *   is "not set here"; the value shown dimmed is no move (`0px`) or no
 *   scaling (`1`).
 * It opens split when an axis is set; `translate-y` in the search lands on Y.
 * The look is rotate's, without its select (none is typed); the icons the
 * owner's, some axes derived (Icon.tsx).
 */
function AxesEditor({ config, ...props }: PropertyEditorProps & { config: AxesConfig }) {
  const { property, placeholder } = config;
  const { onChange, onRevert, focusRequest, onReturnToSearch, onTabOut, query = "" } = props;
  const value = declaredOf(props, property);
  const axisValue = (axis: Axis) => declaredOf(props, axisVar(property, axis));
  const anyAxis = AXES.some((a) => axisValue(a));
  const landing = (q: string): Axis | null => {
    const n = normalizeQuery(q);
    for (const axis of AXES) if (n.startsWith(`${property}${axis}`)) return axis;
    return null;
  };
  const [view, setView] = useState<View>(() => (anyAxis || landing(query) ? "axes" : "one"));
  useLayoutEffect(() => {
    if (landing(query)) setView("axes");
  }, [query]);

  const refs = useRef<Record<string, { current: HTMLInputElement | null }>>(Object.fromEntries(["one", ...AXES].map((k) => [k, { current: null }])));
  const [pending, setPending] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!focusRequest) return;
    const axis = landing(focusRequest.query);
    if (axis) {
      setView("axes");
      setPending(axis);
    } else setPending(view === "axes" ? (focusRequest.edge === "last" ? "z" : "x") : "one");
  }, [focusRequest]);
  useLayoutEffect(() => {
    if (!pending) return;
    refs.current[pending]?.current?.focus();
    refs.current[pending]?.current?.select();
    setPending(null);
  }, [pending, view]);

  const tabOut = (direction: 1 | -1) => (onTabOut ? onTabOut(direction) : onReturnToSearch?.());

  // Moving along Z shows only with a perspective on the parent: the footer asks for one when it has none.
  const [deep, setDeep] = useState(false);
  usePerspectiveHint(props.element, deep, props.onHint);

  // One value: the property, and the axes Pilot set go (one undo step), so the two never disagree.
  const writeOne = (next: string, gesture: object = {}) => {
    for (const a of AXES) if (axisValue(a)) onChange(axisVar(property, a), "", { gesture });
    onChange(property, next, { gesture });
  };
  // An axis, with the property combining them, as one undo step; the property goes when the last axis does
  // (only Pilot's combining value: the page's stays).
  const writeAxis = (axis: Axis, next: string, gesture: object = {}) => {
    onChange(axisVar(property, axis), next, { gesture });
    const left = AXES.some((a) => (a === axis ? next : axisValue(a)));
    if (left) {
      const combined = axesValue(property, value);
      if (combined !== value) onChange(property, combined, { gesture });
    } else if (isAxesValue(property, value)) onChange(property, "", { gesture });
  };
  // One part only (`10px`, `1.5`): steps and drags; several, or none, don't.
  const stepOne = (text: string, delta: number) => (/\s/.test(text.trim()) ? null : stepValue(property, text, delta, FROM[property]));

  const toggle = () => {
    const next: View = view === "one" ? "axes" : "one";
    setView(next);
    setPending(next === "axes" ? "x" : "one");
  };
  const toggleButton = (
    <Tooltip text={view === "one" ? "Split" : "One value"}>
      <button
        type="button"
        class="split-toggle"
        aria-label={view === "one" ? `${config.label} each axis` : `One ${property} value`}
        aria-pressed={view === "axes"}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        {view === "one" ? <Icon name={`${property}-all`} /> : AXES.map((a) => <Icon key={a} name={`${property}-${a}`} />)}
      </button>
    </Tooltip>
  );

  if (view === "one") {
    return (
      <div class="split-editor" data-view="one">
        <PropertyRow label={property} action={toggleButton}>
          <PropertyInputText
            // The axes set (Pilot's combining value): empty, reading Mixed, as a split editor's parts that differ.
            value={isAxesValue(property, value) ? "" : value}
            label={`${property} value`}
            placeholder={isMixed(props, property) || isAxesValue(property, value) || anyAxis ? MIXED : placeholder}
            inputRef={refs.current.one}
            onCommit={(text) => {
              if (!text.trim()) return (value || anyAxis) && writeOne("");
              const next = parseTransform(property, text);
              if (next && next !== value) writeOne(next);
            }}
            onStep={(delta, text, gesture) => {
              const next = stepOne(text, delta);
              if (next) writeOne(next, gesture);
            }}
            onScrub={(steps, startText, gesture) => {
              if (steps === 0) return void onRevert?.(property, gesture);
              const next = stepOne(startText, steps);
              if (next) writeOne(next, gesture);
            }}
            onSubmit={onReturnToSearch}
            onTab={tabOut}
          />
        </PropertyRow>
      </div>
    );
  }

  return (
    <div class="split-editor" data-view="axes">
      <PropertyRow
        // Each axis's own label, level with its field: Tailwind's names (no CSS longhand per axis), as rotate's.
        label={
          <span class="row-labels">
            {AXES.map((axis) => (
              <span key={axis}>{`${property}-${axis}`}</span>
            ))}
          </span>
        }
        class="parts"
        action={toggleButton}
      >
        <div class="stack">
          {AXES.map((axis, i) => (
            <span
              key={axis}
              class="field"
              onFocusIn={config.depth?.includes(axis) ? () => setDeep(true) : undefined}
              onFocusOut={config.depth?.includes(axis) ? () => setDeep(false) : undefined}
            >
              <PropertyInputText
                value={axisValue(axis)}
                label={`${property} ${axis}`}
                placeholder={isMixed(props, axisVar(property, axis)) ? MIXED : placeholder}
                inputRef={refs.current[axis]}
                onCommit={(text) => {
                  const next = text.trim() ? parseAxis(property, text) : "";
                  if (next !== null && next !== axisValue(axis)) writeAxis(axis, next);
                }}
                onStep={(delta, text, gesture) => {
                  const next = stepValue(property, text, delta, FROM[property]);
                  if (next) writeAxis(axis, next, gesture);
                }}
                onScrub={(steps, startText, gesture) => {
                  if (steps === 0) {
                    onRevert?.(axisVar(property, axis), gesture);
                    onRevert?.(property, gesture);
                    return;
                  }
                  const next = stepValue(property, startText, steps, FROM[property]);
                  if (next) writeAxis(axis, next, gesture);
                }}
                onSubmit={onReturnToSearch}
                onTab={(direction) => {
                  const next = i + direction;
                  if (next >= 0 && next < AXES.length) setPending(AXES[next] as Axis);
                  else tabOut(direction);
                }}
              />
            </span>
          ))}
        </div>
      </PropertyRow>
    </div>
  );
}

/** Define a transform split into axes (translate, scale): see AxesEditor. */
export function axesEditor(config: AxesConfig): PropertyEditor {
  return {
    id: config.property,
    label: config.label,
    properties: [config.property, ...AXES.map((a) => axisVar(config.property, a))],
    // One of the transforms: searching `transform` finds it.
    partOf: "transform",
    aliases: config.aliases,
    component: (props: PropertyEditorProps) => <AxesEditor {...props} config={config} />,
  };
}

/** translate: where it's moved, in px (or any length), on X, Y and Z. */
export const translateEditor = axesEditor({
  property: "translate",
  label: "Translate",
  // Tailwind's translate-*, translate-x-*, translate-y-*, translate-z-*.
  aliases: ["translate-x-4", "translate-y-4", "translate-z-4", "translate-none", "translate-full"],
  placeholder: "0px",
  depth: ["z"],
});

/** scale: how much bigger or smaller, a factor (1.5) or a percentage (150%), on X, Y and Z. */
export const scaleEditor = axesEditor({
  property: "scale",
  label: "Scale",
  // Tailwind's scale-*, scale-x-*, scale-y-*, scale-z-*.
  aliases: ["scale-50", "scale-x-50", "scale-y-50", "scale-z-50", "scale-none"],
  placeholder: "1",
});
