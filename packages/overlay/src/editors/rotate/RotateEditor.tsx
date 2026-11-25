import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Tooltip } from "../../ui/components/Tooltip/Tooltip.tsx";
import { Icon } from "../../ui/components/Icon/Icon.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { declaredOf, isMixed, MIXED } from "../declared.ts";
import { normalizeQuery } from "../query.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import { AXES, type Axis, axesTransform, axisVar, isAxesTransform, parseAxis, parseRotate, stepAngle } from "./rotate.ts";

const PROPERTY = "rotate";
/** The one-value select: an angle (any `rotate` value), or none (`rotate: none`). "Select" is nothing set. */
const MODES = ["angle", "none"] as const;

type View = "one" | "axes";

/** Where the search lands: `rotate-x`/`-y`/`-z` (Tailwind's) on that axis, split. */
function landing(query: string): Axis | null {
  const q = normalizeQuery(query);
  for (const axis of AXES) if (q.startsWith(`rotate${axis}`)) return axis;
  return null;
}

/**
 * rotate (a prototype for the owner to try): one value, or split into X, Y
 * and Z, switched by the button at the right of the row (padding's way).
 * - One value: a select (angle, none) and a field with any `rotate` value
 *   (`30deg`, `x 30deg`, `1 1 0 45deg`; the dial for a plain angle). none
 *   declares `rotate: none` and hides the field.
 * - Split: a field per axis, each its own entry (so X alone can change on
 *   hover), written as a variable plus one `transform` that combines them
 *   (rotate.ts). Empty is "not set here" (the normal value applies); `0deg`
 *   is no rotation on that axis.
 * It opens split when an axis is set; `rotate-x` in the search lands on X.
 */
function RotateEditor(props: PropertyEditorProps) {
  const { onChange, onRevert, focusRequest, onReturnToSearch, onTabOut, query = "" } = props;
  const value = declaredOf(props, PROPERTY);
  const axisValue = (axis: Axis) => declaredOf(props, axisVar(axis));
  const anyAxis = AXES.some((a) => axisValue(a));
  const [view, setView] = useState<View>(() => (anyAxis || landing(query) ? "axes" : "one"));
  useLayoutEffect(() => {
    if (landing(query)) setView("axes");
  }, [query]);

  // The select's "angle", picked before an angle is typed: the field shows,
  // empty, and nothing is written until it is (from none, none stays till
  // then). Any change of value (typed, undone) clears it.
  const [pickedAngle, setPickedAngle] = useState(false);
  useEffect(() => setPickedAngle(false), [value]);
  const mode = pickedAngle ? "angle" : value === "none" ? "none" : value ? "angle" : "";

  const refs = useRef<Record<string, { current: HTMLInputElement | null }>>(
    Object.fromEntries(["one", "select", ...AXES].map((k) => [k, { current: null }])),
  );
  const selectRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!focusRequest) return;
    const axis = landing(focusRequest.query);
    if (axis) {
      setView("axes");
      setPending(axis);
    } else setPending(view === "axes" ? (focusRequest.edge === "last" ? "z" : "x") : mode === "angle" ? "one" : "select");
  }, [focusRequest]);
  useLayoutEffect(() => {
    if (!pending) return;
    if (pending === "select") selectRef.current?.focus();
    else {
      refs.current[pending]?.current?.focus();
      refs.current[pending]?.current?.select();
    }
    setPending(null);
  }, [pending, view]);

  const tabOut = (direction: 1 | -1) => (onTabOut ? onTabOut(direction) : onReturnToSearch?.());

  // An axis, with the transform that combines them, as one undo step; the
  // transform goes when the last axis does (only Pilot's: the page's stays).
  const writeAxis = (axis: Axis, next: string, gesture: object = {}) => {
    onChange(axisVar(axis), next, { gesture });
    const transform = declaredOf(props, "transform");
    const left = AXES.some((a) => (a === axis ? next : axisValue(a)));
    if (left) {
      const combined = axesTransform(transform);
      if (combined !== transform) onChange("transform", combined, { gesture });
    } else if (isAxesTransform(transform)) onChange("transform", "", { gesture });
  };

  const toggle = () => {
    const next: View = view === "one" ? "axes" : "one";
    setView(next);
    setPending(next === "axes" ? "x" : mode === "angle" ? "one" : "select");
  };
  const toggleButton = (
    <Tooltip text={view === "one" ? "Split" : "One value"}>
      <button
        type="button"
        class="split-toggle"
        aria-label={view === "one" ? "Rotate each axis" : "One rotate value"}
        aria-pressed={view === "axes"}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        {/* The owner's icons: one value (a turn on the screen), or each axis's, level with its field. */}
        {view === "one" ? <Icon name="rotate-all" /> : AXES.map((a) => <Icon key={a} name={`rotate-${a}`} />)}
      </button>
    </Tooltip>
  );

  if (view === "one") {
    return (
      <div class="split-editor rotate-editor" data-view="one">
        <PropertyRow label={PROPERTY} action={toggleButton}>
          <div class="rotate-value" data-joined={mode === "angle" || undefined}>
            <PropertySelect
              value={mode}
              options={MODES}
              label="rotate"
              placeholder={isMixed(props, PROPERTY) ? MIXED : undefined}
              triggerRef={selectRef}
              // With an angle, a 24px icon beside the field (it gets the room); otherwise the select fills the row.
              iconOnly={mode === "angle"}
              iconFor={(m) => <Icon name={m === "angle" ? "rotate-angle" : m === "none" ? "mask-none" : "layout-empty"} />}
              onChange={(next) => {
                if (next === "none") return value !== "none" && onChange(PROPERTY, "none");
                if (next === "angle") {
                  setPickedAngle(true);
                  requestAnimationFrame(() => {
                    refs.current.one?.current?.focus();
                    refs.current.one?.current?.select();
                  });
                  return;
                }
                setPickedAngle(false);
                if (value) onChange(PROPERTY, "");
              }}
              onTab={(direction) => (direction > 0 && mode === "angle" ? setPending("one") : tabOut(direction))}
            />
            {mode === "angle" && (
              <PropertyInputText
                value={value === "none" ? "" : value}
                label="rotate value"
                placeholder="0deg"
                inputRef={refs.current.one}
                onCommit={(text) => {
                  if (!text.trim()) return value && onChange(PROPERTY, "");
                  const next = parseRotate(text);
                  if (next && next !== value) onChange(PROPERTY, next);
                }}
                onStep={(delta, text, gesture) => {
                  const next = stepAngle(text, delta);
                  if (next) onChange(PROPERTY, next, gesture && { gesture });
                }}
                onScrub={(steps, startText, gesture) => {
                  if (steps === 0) return void onRevert?.(PROPERTY, gesture);
                  const next = stepAngle(startText, steps);
                  if (next) onChange(PROPERTY, next, { gesture });
                }}
                onSubmit={onReturnToSearch}
                onTab={(direction) => (direction < 0 ? setPending("select") : tabOut(1))}
                dial
              />
            )}
          </div>
        </PropertyRow>
      </div>
    );
  }

  return (
    <div class="split-editor rotate-editor" data-view="axes">
      <PropertyRow
        // Each axis's own label, level with its field, as padding's sides: Tailwind's names (rotate has no
        // longhand per axis), as gap's gap-x and gap-y.
        label={
          <span class="row-labels">
            {AXES.map((axis) => (
              <span key={axis}>{`rotate-${axis}`}</span>
            ))}
          </span>
        }
        class="parts"
        action={toggleButton}
      >
        <div class="stack">
          {AXES.map((axis, i) => (
            <span key={axis} class="field">
              <PropertyInputText
                value={axisValue(axis)}
                label={`rotate ${axis}`}
                placeholder={isMixed(props, axisVar(axis)) ? MIXED : "0deg"}
                inputRef={refs.current[axis]}
                onCommit={(text) => {
                  const next = text.trim() ? parseAxis(text) : "";
                  if (next !== null && next !== axisValue(axis)) writeAxis(axis, next);
                }}
                onStep={(delta, text, gesture) => {
                  const next = stepAngle(text, delta);
                  if (next) writeAxis(axis, next, gesture);
                }}
                onScrub={(steps, startText, gesture) => {
                  if (steps === 0) {
                    onRevert?.(axisVar(axis), gesture);
                    onRevert?.("transform", gesture);
                    return;
                  }
                  const next = stepAngle(startText, steps);
                  if (next) writeAxis(axis, next, gesture);
                }}
                onSubmit={onReturnToSearch}
                dial
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

export const rotateEditor: PropertyEditor = {
  id: PROPERTY,
  label: "Rotate",
  properties: [PROPERTY, ...AXES.map(axisVar)],
  // The axes write the transform that combines them.
  reads: ["transform"],
  // Tailwind's rotate-*, rotate-x-*, rotate-y-*, rotate-z-*.
  aliases: ["rotate-45", "rotate-none", "rotate-x-45", "rotate-y-45", "rotate-z-45"],
  component: RotateEditor,
};
