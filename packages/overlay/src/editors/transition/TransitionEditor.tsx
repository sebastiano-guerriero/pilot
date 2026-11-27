import { useEffect, useRef, useState } from "preact/hooks";
import { EasingGraph } from "../../ui/components/EasingGraph/EasingGraph.tsx";
import { LayerList } from "../../ui/components/LayerList/LayerList.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { declaredOf, isMixed, isOwn, MIXED, pageOf } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import {
  BEZIER_RANGE,
  bezierAt,
  bezierNumbers,
  curveOf,
  EASING_OPTIONS,
  easingFor,
  easingKind,
  parseBezierNumbers,
  scaleTime,
  SPRING,
  springIn,
} from "./easing.ts";
import { DEFAULT_BOUNCE, MAX_BOUNCE, springCurve, springEasing, springPeak } from "./spring.ts";

/** A spring's graph: a square from 0 to the most bounce's overshoot, so it holds still as the bounce changes. */
const SPRING_RANGE: [number, number] = [0, springPeak(MAX_BOUNCE)];
import {
  formatShorthand,
  type Item,
  NEW_DURATION,
  parseEasing,
  parsePropertyName,
  parseShorthand,
  parseTime,
  parseTransitionProperty,
  PROPERTY,
  SHORTHAND,
  stepTime,
  type Timing,
  TIMINGS,
  TRANSITION_PROPERTIES,
} from "./transition.ts";

const CUSTOM = "custom";
/** "Mixed": the selected elements differ. */
const PER_TRANSITION = MIXED;

/** A timing row's label: the longhands' names don't fit (Tailwind's words, easing for timing-function). */
const LABELS: Record<Timing, string> = {
  "transition-duration": "duration",
  "transition-timing-function": "easing",
  "transition-delay": "delay",
};

/** The item's field for a timing. */
const FIELD: Record<Timing, "duration" | "easing" | "delay"> = {
  "transition-duration": "duration",
  "transition-timing-function": "easing",
  "transition-delay": "delay",
};

/** The panel's footer, per what's picked. */
const HINTS = {
  property: "Animates when its value changes (on hover, say).",
  custom: "Any other property, by its name as CSS writes it: padding, --progress.",
  none: "Declares transition: none, taking off the page's transitions. × on the chip declares nothing instead.",
};

/** What a panel's timing shows with nothing set, nor a row's: CSS's for the times (0s), "" for easing's ("Select"). */
const initialOf = (t: Timing) => (t === "transition-timing-function" ? "" : "0s");

/** What the property select shows for a transition: its property, custom (any other), or none. */
function optionOf(name: string): string {
  if (name === "none") return "none";
  return (TRANSITION_PROPERTIES as readonly string[]).includes(name) ? name : CUSTOM;
}

/** A spring's duration is how long it feels (easing.ts): a real one shown divided back, a felt one written longer. */
const felt = (real: string, easing: string) => {
  const spring = springIn(easing);
  return real && spring ? (scaleTime(real, 1 / spring.factor) ?? real) : real;
};
const lasting = (shown: string, easing: string) => {
  const spring = springIn(easing);
  return shown && spring ? (scaleTime(shown, spring.factor) ?? shown) : shown;
};

/**
 * The transitions and the rows, as the editor reads them (the owner's model,
 * 2026-11-27: two separate things):
 * - the transitions are the `transition` shorthand's, each with what its panel
 *   set (Pilot's, or the page's); a page that sets only the property list
 *   (Tailwind's `transition-opacity`) gives transitions with no timing of
 *   their own;
 * - a row is its longhand set on its own: Pilot's own value, or the page's
 *   when its shorthand doesn't give it (Tailwind's `duration-300`). A
 *   longhand the shorthand gives is the panels', not a row's.
 */
function read(props: PropertyEditorProps) {
  const shorthand = parseShorthand(declaredOf(props, SHORTHAND));
  const names = shorthand ? null : parseTransitionProperty(declaredOf(props, PROPERTY));
  const items: Item[] | "none" =
    shorthand ?? (names === "none" ? "none" : (names ?? []).map((name) => ({ name, duration: "", easing: "", delay: "", behavior: "" })));
  const pageShorthand = !!pageOf(props, SHORTHAND);
  const row = (t: Timing) => (isOwn(props, t) ? declaredOf(props, t) : pageShorthand ? "" : pageOf(props, t));
  return { items, row };
}

/**
 * Write the transitions (one undo step with `gesture`): the shorthand, then
 * the rows set again after it, so they still apply over it (a shorthand
 * replaces its longhands, and CSS reads them in that order).
 */
function writeItems(props: PropertyEditorProps, items: Item[] | "none", gesture: object) {
  const { row } = read(props);
  const value = items === "none" || items.length ? formatShorthand(items) : "";
  if (value === declaredOf(props, SHORTHAND)) return;
  props.onChange(SHORTHAND, value, { gesture });
  // None left: the page's own property list goes too (the transitions read from it).
  if (!value && pageOf(props, PROPERTY) && !pageOf(props, SHORTHAND)) props.onChange(PROPERTY, "", { gesture });
  for (const t of TIMINGS) {
    const v = row(t);
    if (v) props.onChange(t, v, { gesture, again: true });
  }
}

/**
 * transition (the owner's design, 2026-11-27), filter's way (LayerList): the
 * row lists the transitions as chips, + adds one; each opens a panel: which
 * property (one of the common ones, custom for any other, or none), then its
 * own duration, easing and delay, written as the `transition` shorthand, one
 * entry each. Under the chips, the duration, easing and delay rows (editors
 * of their own, its embeds) are the longhands set on their own, empty until
 * used: set, a row applies to every transition, over the panels' (CSS reads
 * the longhand after the shorthand; the panel says so). The two never edit
 * each other. A new transition gets Tailwind's 150ms when no duration row is
 * set: without one, nothing animates.
 */
function TransitionEditor(props: PropertyEditorProps) {
  const mixed = isMixed(props, SHORTHAND) || isMixed(props, PROPERTY);
  const { items, row } = read(props);
  const list = items === "none" ? [] : items;
  const [open, setOpen] = useState<number | null>(null);
  const write = (next: Item[] | "none", gesture: object = {}) => writeItems(props, next, gesture);

  const add = () => {
    const name = TRANSITION_PROPERTIES.find((p) => p !== "all" && !list.some((i) => i.name === p)) ?? "all";
    write([...list, { name, duration: row("transition-duration") ? "" : NEW_DURATION, easing: "", delay: "", behavior: "" }]);
    setOpen(list.length);
  };
  const remove = (i: number) => {
    setOpen(null);
    write(items === "none" ? [] : list.filter((_, j) => j !== i));
  };
  const rename = (i: number, name: string) => {
    // none is the whole value: the others go.
    if (name === "none") return write("none");
    write(list.map((item, j) => (j === i ? { ...item, name } : item)));
  };
  const setTiming = (i: number, t: Timing, next: string, gesture: object = {}) => {
    const item = list[i] as Item;
    if (t === "transition-duration") return write(list.map((it, j) => (j === i ? { ...it, duration: lasting(next, it.easing) } : it)), gesture);
    if (t === "transition-delay") return write(list.map((it, j) => (j === i ? { ...it, delay: next } : it)), gesture);
    // A spring in or out (or its bounce changed): its duration keeps how long it feels.
    const duration = item.duration && lasting(felt(item.duration, item.easing), next);
    write(list.map((it, j) => (j === i ? { ...it, easing: next, duration } : it)), gesture);
  };

  // A chip: the property, its own duration dimmed after it (as it feels).
  const chips = items === "none" ? [{ name: "none" }] : list.map((i) => ({ name: i.name, hint: felt(i.duration, i.easing) || undefined }));
  const current = open === null ? undefined : items === "none" ? "none" : list[open]?.name;
  // Custom, picked before its name is typed: kept for the open panel until the value changes.
  const [pickedCustom, setPickedCustom] = useState(false);
  useEffect(() => setPickedCustom(false), [open, declaredOf(props, SHORTHAND)]);
  const custom = current !== undefined && current !== "none" && (pickedCustom || optionOf(current) === CUSTOM);
  const item = open === null ? undefined : list[open];
  // The panel's footnotes: the rows set apply over it; a spring settles after its duration.
  const overridden = TIMINGS.filter((t) => row(t)).map((t) => LABELS[t]);
  const notes = [
    current && HINTS[current === "none" ? "none" : custom ? "custom" : "property"],
    current !== "none" && overridden.length
      ? `The ${overridden.join(", ")} ${overridden.length > 1 ? "rows apply" : "row applies"} to every transition, over this one's.`
      : null,
    item && springIn(item.easing) && item.duration ? `A spring settles after its duration: this one at ${item.duration}.` : null,
  ].filter(Boolean);

  return (
    <div class="transition-editor">
      <LayerList
        label="transition"
        items={chips}
        mixed={mixed}
        open={open}
        onOpen={setOpen}
        onAdd={add}
        // none is the whole value: nothing can join it (× on its chip first).
        noAdd={items === "none"}
        onRemove={remove}
        noun="transition"
        panelTitle="Transition"
        focusRequest={props.focusRequest}
        footer={current && notes.join(" ")}
      >
        {open !== null && current !== undefined && (
          <TransitionRows
            name={current}
            custom={custom}
            timing={(t) => (item ? (t === "transition-duration" ? felt(item.duration, item.easing) : item[FIELD[t]]) : "")}
            shared={(t) => (t === "transition-duration" ? felt(row(t), row("transition-timing-function")) : row(t)) || initialOf(t)}
            onPick={(option) => {
              if (option === CUSTOM) return setPickedCustom(true);
              setPickedCustom(false);
              if (option !== current) rename(open, option);
            }}
            onRename={(name) => rename(open, name)}
            onTiming={(t, next, gesture) => setTiming(open, t, next, gesture)}
            // A panel's drag writes the shorthand, and the rows again after it.
            onRevert={(gesture) => [SHORTHAND, ...TIMINGS].forEach((p) => props.onRevert?.(p, gesture))}
          />
        )}
      </LayerList>
      {items !== "none" &&
        TIMING_EDITORS.map((editor) => (
          <div key={editor.id} data-row={editor.id} style={{ display: "contents" }}>
            <editor.component {...props} focusRequest={undefined} />
          </div>
        ))}
    </div>
  );
}

/**
 * One transition's panel: its property (custom: a select and the name typed
 * beside it, sharing the row), then its own timing, whichever it is.
 */
function TransitionRows({
  name,
  custom,
  timing,
  shared,
  onPick,
  onRename,
  onTiming,
  onRevert,
}: {
  name: string;
  /** Custom shows: the property isn't one of the list's, or custom was just picked. */
  custom: boolean;
  /** Its own value for a timing, "" when it sets none. */
  timing(t: Timing): string;
  /** What applies when it sets none: the row's, else CSS's. */
  shared(t: Timing): string;
  onPick(option: string): void;
  onRename(name: string): void;
  onTiming(t: Timing, next: string, gesture?: object): void;
  /** Take back what a drag (`gesture`) wrote: back where it started, no change left. */
  onRevert(gesture: object): void;
}) {
  const fieldRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <PropertyRow label="property">
        <PropertySelect
          value={custom ? CUSTOM : name}
          options={[...TRANSITION_PROPERTIES, CUSTOM, "none"]}
          label="transition property"
          clearable={false}
          // custom and none apart from the properties.
          separateFrom={CUSTOM}
          onChange={(option) => {
            onPick(option);
            // Straight into the field, to type the name.
            if (option === CUSTOM) requestAnimationFrame(() => fieldRef.current?.focus());
          }}
        />
        {custom && (
          <PropertyInputText
            value={optionOf(name) === CUSTOM ? name : ""}
            label="custom transition property"
            // A property the select doesn't list.
            placeholder="padding"
            inputRef={fieldRef}
            onCommit={(text) => {
              const next = parsePropertyName(text);
              if (next && next !== name) onRename(next);
            }}
          />
        )}
      </PropertyRow>
      {name !== "none" &&
        TIMINGS.map((t) => (
          <TimingRow
            key={t}
            timing={t}
            value={timing(t)}
            placeholder={shared(t)}
            of={name}
            onSet={(next, gesture) => onTiming(t, next, gesture)}
            onRevert={onRevert}
          />
        ))}
    </>
  );
}

/**
 * A timing's row: a field for duration and delay (a bare number is ms, ↑/↓
 * step by 10ms), easing's presets for the timing function, and custom with a
 * field beside it for any other (cubic-bezier()). `value` "" shows the
 * placeholder: what applies.
 */
function TimingRow({
  timing,
  value,
  placeholder,
  of = "transition",
  onSet,
  onRevert,
}: {
  timing: Timing;
  value: string;
  placeholder: string;
  /** Whose timing, for screen readers: "opacity duration" in a panel, "transition duration" for all. */
  of?: string;
  onSet(next: string, gesture?: object): void;
  /** Take back what a drag (`gesture`) wrote: back where it started, no change left. */
  onRevert?(gesture: object): void;
}) {
  const label = LABELS[timing];
  if (timing === "transition-timing-function")
    return <EasingRow value={value} placeholder={placeholder} of={of} onSet={onSet} onRevert={onRevert} />;
  return (
    <PropertyRow label={label}>
      <PropertyInputText
        value={value}
        label={`${of} ${label}`}
        placeholder={placeholder}
        // The page's durations (Tailwind's --default-transition-duration, a spring's own).
        tokens={{ kinds: ["time"], property: timing }}
        onCommit={(text) => {
          if (!text.trim()) return value && onSet("");
          const next = parseTime(timing, text);
          if (next && next !== value) onSet(next);
        }}
        onStep={(delta, text, gesture) => {
          const next = stepTime(timing, text || (placeholder === PER_TRANSITION ? "" : placeholder), delta);
          if (next) onSet(next, gesture);
        }}
      />
    </PropertyRow>
  );
}

/**
 * Easing (the owner's, 2026-11-27): a select of CSS's keywords, spring, and
 * custom, and under it the graph of the easing set here: a keyword's curve
 * or a cubic-bezier's, with two handles to drag and its four numbers to type
 * (dragged, it's a cubic-bezier, and the select says so; dragged back onto a
 * keyword's curve, that keyword), or a spring's, set by its bounce. Nothing
 * set ("Select"): no graph (the owner's, 2026-11-27). Custom: a field beside
 * the select for anything else (steps(), a variable: the page's easing
 * variables listed), no graph.
 */
function EasingRow({
  value,
  placeholder,
  of,
  onSet,
  onRevert,
}: {
  value: string;
  placeholder: string;
  of: string;
  onSet(next: string, gesture?: object): void;
  onRevert?(gesture: object): void;
}) {
  const kind = easingKind(value);
  const [pickedCustom, setPickedCustom] = useState(false);
  useEffect(() => setPickedCustom(false), [value]);
  const option = pickedCustom ? CUSTOM : kind;
  const fieldRef = useRef<HTMLInputElement>(null);
  // Nothing of its own: what applies, dimmed in the select ("Select" when nothing does).
  const mixed = placeholder === PER_TRANSITION;
  const shared = mixed ? PER_TRANSITION : easingKind(placeholder) || undefined;
  // What the graph draws: its own easing only.
  const drawn = option === CUSTOM ? "" : value;
  const curve = curveOf(drawn);
  const spring = curve ? null : springIn(drawn);
  const pick = (next: string) => {
    setPickedCustom(false);
    if (next === CUSTOM) {
      setPickedCustom(true);
      requestAnimationFrame(() => fieldRef.current?.focus());
      return;
    }
    if (next === SPRING) return onSet(springEasing(springIn(value)?.bounce ?? springIn(placeholder)?.bounce ?? DEFAULT_BOUNCE));
    if (next !== value) onSet(next);
  };
  return (
    <>
      <PropertyRow label="easing">
        <PropertySelect value={option} options={EASING_OPTIONS} label={`${of} easing`} placeholder={shared} onChange={pick} />
        {option === CUSTOM && (
          <PropertyInputText
            value={kind === CUSTOM ? value : ""}
            label={`${of} custom easing`}
            placeholder="steps(4)"
            inputRef={fieldRef}
            // The page's easing variables (Tailwind's --ease-out, a spring's linear()).
            tokens={{ kinds: ["easing"], property: "transition-timing-function" }}
            onCommit={(text) => {
              if (!text.trim()) return value && onSet("");
              const next = parseEasing(text);
              if (next && next !== value) onSet(next);
            }}
          />
        )}
      </PropertyRow>
      {option !== CUSTOM && curve && (
        <EasingGraph
          label={`${of} easing curve`}
          curve={(x) => bezierAt(curve, x)}
          handles={curve}
          range={BEZIER_RANGE}
          lines={[0, 1]}
          onHandles={(next, gesture) => onSet(easingFor(next), gesture)}
        />
      )}
      {option !== CUSTOM && spring && <EasingGraph label={`${of} spring curve`} curve={springCurve(spring)} range={SPRING_RANGE} lines={[0, 1]} grid={0.25} />}
      {curve && (
        <PropertyRow label="curve">
          <PropertyInputText
            value={bezierNumbers(curve)}
            label={`${of} easing curve numbers`}
            placeholder="0, 0, 0.58, 1"
            onCommit={(text) => {
              const next = parseBezierNumbers(text);
              if (next && easingFor(next) !== value) onSet(easingFor(next));
            }}
          />
        </PropertyRow>
      )}
      {kind === SPRING && spring && (
        <PropertyRow label="bounce">
          <PropertyInputText
            value={`${spring.bounce}%`}
            label={`${of} spring bounce`}
            placeholder="30%"
            onCommit={(text) => {
              const m = /^(\d*\.?\d+)%?$/.exec(text.trim());
              if (!m) return;
              const next = springEasing(Math.min(MAX_BOUNCE, Number(m[1])));
              if (next !== value) onSet(next);
            }}
            onStep={(delta, _text, gesture) => {
              const bounce = Math.min(MAX_BOUNCE, Math.max(0, spring.bounce + delta));
              if (bounce !== spring.bounce) onSet(springEasing(bounce), gesture);
            }}
            // The wheel: 1% a step, from where the drag started; back there, nothing written.
            onScrub={(steps, startText, gesture) => {
              if (steps === 0) return void onRevert?.(gesture);
              const start = Number(/^(\d*\.?\d+)/.exec(startText.trim())?.[1] ?? spring.bounce);
              onSet(springEasing(Math.min(MAX_BOUNCE, Math.max(0, start + steps))), gesture);
            }}
          />
        </PropertyRow>
      )}
    </>
  );
}

/**
 * A row: its longhand, set on its own, for every transition (over the
 * panels'), empty until used. Cleared, the element sets none: the panels'
 * apply again. Its duration is how long it feels when its easing is a spring.
 */
function SharedTimingEditor({ timing, ...props }: PropertyEditorProps & { timing: Timing }) {
  const { row } = read(props);
  const easing = row("transition-timing-function");
  const value = timing === "transition-duration" ? felt(row(timing), easing) : row(timing);
  const set = (next: string, gesture: object = {}) => {
    if (timing === "transition-duration") props.onChange(timing, lasting(next, easing), { gesture });
    else props.onChange(timing, next, { gesture });
    // A spring in or out (or its bounce changed): the row's duration keeps how long it feels.
    const duration = row("transition-duration");
    if (timing === "transition-timing-function" && duration) {
      const real = lasting(felt(duration, easing), next);
      if (real !== duration) props.onChange("transition-duration", real, { gesture });
    }
    // Cleared: Pilot's shorthand again after it, so the panels' value applies (not the page's).
    if (!next && isOwn(props, SHORTHAND)) props.onChange(SHORTHAND, declaredOf(props, SHORTHAND), { gesture, again: true });
  };
  return (
    <TimingRow
      timing={timing}
      value={value}
      // Nothing set: CSS's 0s for the times (the owner's), "Select" for easing.
      placeholder={isMixed(props, timing) ? PER_TRANSITION : initialOf(timing)}
      onSet={set}
      // A drag on the easing row writes it, and its duration (a spring's felt one).
      onRevert={(gesture) => [timing, "transition-duration", SHORTHAND].forEach((p) => props.onRevert?.(p, gesture))}
    />
  );
}

function timingEditor(timing: Timing, label: string, aliases: string[]): PropertyEditor {
  return {
    id: timing,
    label,
    properties: [timing],
    // The transitions (whether the page's shorthand gives this longhand), and the other row: a spring's duration is
    // how long it feels (easing.ts).
    reads: [SHORTHAND, PROPERTY, ...TIMINGS.filter((t) => t !== timing)],
    aliases,
    component: (props: PropertyEditorProps) => <SharedTimingEditor {...props} timing={timing} />,
  };
}

// Tailwind's duration-*, ease-*, delay-*.
export const transitionDurationEditor = timingEditor("transition-duration", "Duration", ["duration-300"]);
export const transitionEasingEditor = timingEditor("transition-timing-function", "Easing", ["ease-linear", "ease-in", "ease-out", "ease-in-out"]);
export const transitionDelayEditor = timingEditor("transition-delay", "Delay", ["delay-150"]);
const TIMING_EDITORS = [transitionDurationEditor, transitionEasingEditor, transitionDelayEditor];

export const transitionEditor: PropertyEditor = {
  id: "transition",
  label: "Transition",
  // The shorthand (the panels' transitions), and the property list a page may set on its own (Tailwind's).
  properties: [SHORTHAND, PROPERTY],
  // Its rows: editors of their own (searching `duration` shows just that row), listed with it.
  embeds: TIMING_EDITORS,
  listsEmbeds: true,
  // Tailwind's transition-* (the property utilities).
  aliases: ["transition", "transition-all", "transition-colors", "transition-opacity", "transition-shadow", "transition-transform", "transition-none"],
  component: TransitionEditor,
};
