import { useEffect, useRef, useState } from "preact/hooks";
import { LayerList } from "../../ui/components/LayerList/LayerList.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { declaredOf, isMixed, MIXED } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import {
  EASINGS,
  itemTiming,
  NEW_DURATION,
  parseEasing,
  parsePropertyName,
  parseTime,
  parseTransitionProperty,
  PROPERTY,
  stepTime,
  type Timing,
  TIMING_INITIAL,
  TIMINGS,
  TRANSITION_PROPERTIES,
  uniformOf,
  withAddedTiming,
  withItemTiming,
  withoutItemTiming,
} from "./transition.ts";

const CUSTOM = "custom";
/** "Mixed" for timings that differ per transition (as for elements that differ). */
const PER_TRANSITION = MIXED;

/** A timing row's label: the longhands' names don't fit (Tailwind's words, easing for timing-function). */
const LABELS: Record<Timing, string> = {
  "transition-duration": "duration",
  "transition-timing-function": "easing",
  "transition-delay": "delay",
};

/** The panel's footer, per what's picked. */
const HINTS = {
  property: "Animates when its value changes (on hover, say). Timing left empty takes the transition's own rows.",
  custom: "Any other property, by its name as CSS writes it: padding, --progress.",
  none: "Declares transition-property: none, taking off the page's transitions. × on the chip declares nothing instead.",
};

/** What the property select shows for a transition: its property, custom (any other), or none. */
function optionOf(name: string): string {
  if (name === "none") return "none";
  return (TRANSITION_PROPERTIES as readonly string[]).includes(name) ? name : CUSTOM;
}

/**
 * transition (the owner's design, 2026-11-27), filter's way (LayerList): the
 * row lists the properties that animate as chips, + adds one; each opens a
 * panel: which property (one of the common ones, custom for any other, or
 * none), then its own duration, easing and delay. Under the chips, the
 * timing's rows (duration, easing, delay: editors of their own, its embeds)
 * set it for every transition at once, as Tailwind's classes do: Pilot writes
 * one value while they're all the same (CSS repeats it), a list only when one
 * transition's differs, and then the shared row shows Mixed (typing there
 * makes them all the same again). In the panel, an empty timing field is "the
 * same as the others" (its placeholder says what that is). The first one
 * added gets Tailwind's 150ms when no duration is set: without one, nothing
 * animates. The longhands are written, never the `transition` shorthand: it
 * would reset the page's own.
 */
function TransitionEditor(props: PropertyEditorProps) {
  const { onChange } = props;
  const value = declaredOf(props, PROPERTY);
  const mixed = isMixed(props, PROPERTY);
  const parsed = mixed ? null : parseTransitionProperty(value);
  const items = parsed === "none" || !parsed ? [] : parsed;
  const n = items.length;
  const timing = (t: Timing) => declaredOf(props, t);
  const [open, setOpen] = useState<number | null>(null);

  // Every change is one undo step: the property, and the timings that pair with it.
  const add = () => {
    const gesture = {};
    const next = TRANSITION_PROPERTIES.find((p) => p !== "all" && !items.includes(p)) ?? "all";
    onChange(PROPERTY, [...items, next].join(", "), { gesture });
    for (const t of TIMINGS) {
      const v = withAddedTiming(timing(t), n);
      if (v !== timing(t)) onChange(t, v, { gesture });
    }
    if (!timing("transition-duration")) onChange("transition-duration", NEW_DURATION, { gesture });
    setOpen(n);
  };
  const remove = (i: number) => {
    const gesture = {};
    setOpen(null);
    // The last one (or none): the transition goes, its timing with it.
    if (n <= 1) {
      onChange(PROPERTY, "", { gesture });
      for (const t of TIMINGS) if (timing(t)) onChange(t, "", { gesture });
      return;
    }
    onChange(PROPERTY, items.filter((_, j) => j !== i).join(", "), { gesture });
    for (const t of TIMINGS) {
      const v = withoutItemTiming(timing(t), n, i);
      if (v !== timing(t)) onChange(t, v, { gesture });
    }
  };
  const rename = (i: number, name: string) => {
    // none is the whole value: the others go (their timing stays, for when one's added again).
    if (name === "none") return onChange(PROPERTY, "none");
    onChange(PROPERTY, items.map((p, j) => (j === i ? name : p)).join(", "));
  };
  const setTiming = (i: number, t: Timing, next: string, gesture: object = {}) => {
    const v = withItemTiming(timing(t), t, n, i, next);
    if (v !== timing(t)) onChange(t, v, { gesture });
  };
  // A chip: the property, its duration dimmed after it while they differ.
  const durations = uniformOf(timing("transition-duration"), n) === null;
  const chips =
    parsed === "none"
      ? [{ name: "none" }]
      : items.map((p, i) => ({ name: p, hint: durations ? itemTiming(timing("transition-duration"), n, i) : undefined }));
  const current = open === null ? undefined : parsed === "none" ? "none" : items[open];
  // Custom, picked before its CSS is typed: kept for the open panel until the value changes.
  const [pickedCustom, setPickedCustom] = useState(false);
  useEffect(() => setPickedCustom(false), [open, value]);
  const custom = current !== undefined && current !== "none" && (pickedCustom || optionOf(current) === CUSTOM);

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
        noAdd={parsed === "none"}
        onRemove={remove}
        noun="transition"
        panelTitle="Transition"
        focusRequest={props.focusRequest}
        footer={current && HINTS[current === "none" ? "none" : custom ? "custom" : "property"]}
      >
        {open !== null && current !== undefined && (
          <TransitionRows
            name={current}
            custom={custom}
            timing={(t) => (current === "none" ? "" : uniformOf(timing(t), n) === null ? itemTiming(timing(t), n, open) : "")}
            shared={(t) => uniformOf(timing(t), n) || TIMING_INITIAL[t]}
            onPick={(option) => {
              if (option === CUSTOM) return setPickedCustom(true);
              setPickedCustom(false);
              if (option !== current) rename(open, option);
            }}
            onRename={(name) => rename(open, name)}
            onTiming={(t, next, gesture) => setTiming(open, t, next, gesture)}
          />
        )}
      </LayerList>
      {parsed !== "none" &&
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
}: {
  name: string;
  /** Custom shows: the property isn't one of the list's, or custom was just picked. */
  custom: boolean;
  /** Its own value for a timing, "" when it takes the shared one. */
  timing(t: Timing): string;
  /** What it takes when its own is empty: the shared value, else CSS's. */
  shared(t: Timing): string;
  onPick(option: string): void;
  onRename(name: string): void;
  onTiming(t: Timing, next: string, gesture?: object): void;
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
}: {
  timing: Timing;
  value: string;
  placeholder: string;
  /** Whose timing, for screen readers: "opacity duration" in a panel, "transition duration" for all. */
  of?: string;
  onSet(next: string, gesture?: object): void;
}) {
  const label = LABELS[timing];
  if (timing === "transition-timing-function") return <EasingRow value={value} placeholder={placeholder} of={of} onSet={onSet} />;
  return (
    <PropertyRow label={label}>
      <PropertyInputText
        value={value}
        label={`${of} ${label}`}
        placeholder={placeholder}
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

function EasingRow({
  value,
  placeholder,
  of,
  onSet,
}: {
  value: string;
  placeholder: string;
  of: string;
  onSet(next: string, gesture?: object): void;
}) {
  const preset = (v: string) => (!v ? "" : (EASINGS as readonly string[]).includes(v) ? v : CUSTOM);
  const [pickedCustom, setPickedCustom] = useState(false);
  useEffect(() => setPickedCustom(false), [value]);
  const option = pickedCustom ? CUSTOM : preset(value);
  // Nothing of its own: what applies, dimmed in the select (a custom one's text in the field).
  const fromPlaceholder = !value && preset(placeholder) === CUSTOM && placeholder !== PER_TRANSITION;
  return (
    <PropertyRow label="easing">
      <PropertySelect
        value={option}
        options={[...EASINGS, CUSTOM]}
        label={`${of} easing`}
        placeholder={fromPlaceholder ? CUSTOM : placeholder}
        onChange={(next) => {
          if (next === CUSTOM) return setPickedCustom(true);
          setPickedCustom(false);
          if (next !== value) onSet(next);
        }}
      />
      {(option === CUSTOM || fromPlaceholder) && (
        <PropertyInputText
          value={preset(value) === CUSTOM ? value : ""}
          label={`${of} custom easing`}
          placeholder={fromPlaceholder ? placeholder : "cubic-bezier(…)"}
          onCommit={(text) => {
            if (!text.trim()) return value && onSet("");
            const next = parseEasing(text);
            if (next && next !== value) onSet(next);
          }}
        />
      )}
    </PropertyRow>
  );
}

/**
 * A timing for every transition at once: one value (CSS repeats it). While
 * the transitions' differ, it shows Mixed, and a value typed makes them all
 * the same; cleared, the element sets none (CSS's applies).
 */
function SharedTimingEditor({ timing, ...props }: PropertyEditorProps & { timing: Timing }) {
  const parsed = parseTransitionProperty(declaredOf(props, PROPERTY));
  const n = Array.isArray(parsed) ? parsed.length : 1;
  const uniform = uniformOf(declaredOf(props, timing), n);
  return (
    <TimingRow
      timing={timing}
      value={uniform ?? ""}
      placeholder={isMixed(props, timing) || uniform === null ? PER_TRANSITION : TIMING_INITIAL[timing]}
      onSet={(next, gesture) => props.onChange(timing, next, { gesture: gesture ?? {} })}
    />
  );
}

function timingEditor(timing: Timing, label: string, aliases: string[]): PropertyEditor {
  return {
    id: timing,
    label,
    properties: [timing],
    // How many transitions there are: whether theirs are all the same.
    reads: [PROPERTY],
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
  properties: [PROPERTY],
  // Its timing rows: editors of their own (searching `duration` shows just that row), listed with it.
  embeds: TIMING_EDITORS,
  listsEmbeds: true,
  // Tailwind's transition-* (the property utilities).
  aliases: ["transition", "transition-all", "transition-colors", "transition-opacity", "transition-shadow", "transition-transform", "transition-none"],
  component: TransitionEditor,
};
