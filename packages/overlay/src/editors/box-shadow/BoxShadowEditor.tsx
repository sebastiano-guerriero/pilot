import { useRef, useState } from "preact/hooks";
import { LayerList } from "../../ui/components/LayerList/LayerList.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { declaredOf, isMixed } from "../declared.ts";
import { BLUR, OFFSET, ShadowRows } from "../shadow/ShadowRows.tsx";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import { angleText } from "../mask/mask.ts";
import { degreesOf } from "../../ui/components/ScrubHandle/ScrubHandle.tsx";
import {
  type BoxShadow,
  formatBoxShadow,
  type ManualShadow,
  NEW_SHADOW,
  parseBoxShadow,
  SHADOW_MODES,
  SHADOW_TYPES,
  type ShadowMode,
  type ShadowType,
  SMOOTH_HINT,
  type SmoothShadow,
  TYPE_HINTS,
  TYPE_TAKES,
} from "./boxShadow.ts";
import { MAX_LAYERS, NEW_SMOOTH, type Smooth, SPREAD_RATIO, pxOf } from "./smooth.ts";

const PROPERTY = "box-shadow";

/** The length rows: x, y, blur, spread. */
const LENGTHS = [
  { part: "x", kind: OFFSET },
  { part: "y", kind: OFFSET },
  { part: "blur", kind: BLUR },
  { part: "spread", kind: OFFSET },
] as const;

const typeOf = (shadow: BoxShadow | "none"): ShadowType => (shadow === "none" ? "none" : shadow.type);

/** A chip: the type, then its lengths dimmed (`outer 0 4px 6px -1px`), or just `smooth` for a smooth one (`outer smooth`). */
function chipOf(shadow: BoxShadow | "none") {
  if (shadow === "none") return { name: "none" };
  if (shadow.type === "custom") return { name: "custom", hint: shadow.text };
  if (shadow.mode === "smooth") return { name: shadow.type, hint: "smooth" };
  const lengths = [shadow.x || "0", shadow.y || "0", shadow.blur, shadow.spread].filter(Boolean);
  return { name: shadow.type, hint: lengths.join(" ") };
}

/** A shadow of another type: outer and inset keep their mode and parts; from none or custom, a new one's. */
function asType(shadow: BoxShadow | "none", type: Exclude<ShadowType, "custom">): BoxShadow | "none" {
  if (type === "none") return "none";
  if (shadow === "none" || shadow.type === "custom") return { ...NEW_SHADOW, type };
  return { ...shadow, type };
}

/** A manual shadow as a smooth one: its offset (distance, direction), its blur (elevation), its color; what's missing, a new one's. */
function toSmooth(shadow: ManualShadow): SmoothShadow {
  const x = pxOf(shadow.x) ?? 0;
  const y = pxOf(shadow.y) ?? 0;
  const length = Math.round(Math.hypot(x, y) * 100) / 100;
  const blur = pxOf(shadow.blur) ?? 0;
  const smooth: Smooth = {
    distance: length,
    direction: length ? Math.round(((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360) : NEW_SMOOTH.direction,
    elevation: blur || length || NEW_SMOOTH.elevation,
    layers: NEW_SMOOTH.layers,
    color: shadow.color || NEW_SMOOTH.color,
  };
  return { type: shadow.type, mode: "smooth", smooth };
}

/** A smooth shadow as one manual layer: where and how soft its outermost layer is, pulled in the same, its whole color. */
function toManual(shadow: SmoothShadow): ManualShadow {
  const { distance: d, direction, elevation: e, color } = shadow.smooth;
  const a = (direction * Math.PI) / 180;
  const px = (n: number) => (Math.abs(n) < 0.005 ? "0" : `${Math.round(n * 100) / 100}px`);
  return { type: shadow.type, mode: "manual", x: px(d * Math.sin(a)), y: px(-d * Math.cos(a)), blur: px(e), spread: px(-SPREAD_RATIO * e), color };
}

/**
 * box-shadow, mask-image's and filter's way (LayerList): the row lists the
 * element's shadows as chips (the type, its lengths dimmed, × to take it
 * off) and a + that adds one; the first is drawn on top. A shadow is edited
 * in a panel beside the dialog: its type (outer, inset, none), its mode
 * (manual: a row per part, x, y, blur, spread, color, ShadowRows; smooth: a
 * stack of layers from distance, direction, layers and color, smooth.ts),
 * and what it does in the footer. × on the last chip clears the property (the element declares no
 * shadow); `none` declares box-shadow: none and is the whole value.
 */
function BoxShadowEditor(props: PropertyEditorProps) {
  const value = declaredOf(props, PROPERTY);
  const mixed = isMixed(props, PROPERTY);
  const shadows = mixed ? null : parseBoxShadow(value);
  // The direction set in the panel, per smooth shadow: the CSS can't say it at
  // distance 0 (read back as 180deg), and says -30deg as 330deg.
  const directions = useRef(new Map<number, number>());
  const read: Array<BoxShadow | "none"> = shadows === "none" ? ["none"] : (shadows ?? []);
  const list = read.map((shadow, i): BoxShadow | "none" => {
    const set = directions.current.get(i);
    if (set === undefined || shadow === "none" || shadow.type === "custom" || shadow.mode !== "smooth") return shadow;
    const same = shadow.smooth.distance === 0 || Math.abs((((set % 360) + 360) % 360) - shadow.smooth.direction) < 0.1;
    return same ? { ...shadow, smooth: { ...shadow.smooth, direction: set } } : shadow;
  });
  const [open, setOpen] = useState<number | null>(null);

  // Every write is the whole value.
  const write = (next: Array<BoxShadow | "none">, gesture: object = {}) => {
    props.onChange(PROPERTY, next.includes("none") ? "none" : formatBoxShadow(next as BoxShadow[]), { gesture });
  };
  const add = () => {
    const next = [...list.filter((s) => s !== "none"), NEW_SHADOW];
    write(next);
    setOpen(next.length - 1);
  };
  const remove = (index: number) => {
    directions.current.clear();
    const next = list.filter((_, i) => i !== index);
    if (next.length) write(next);
    else props.onChange(PROPERTY, "", { gesture: {} });
    setOpen(null);
  };
  const update = (index: number, shadow: BoxShadow | "none", gesture?: object) => {
    if (shadow !== "none" && shadow.type !== "custom" && shadow.mode === "smooth") directions.current.set(index, shadow.smooth.direction);
    else directions.current.delete(index);
    // `none` is the whole value: the other shadows go.
    if (shadow === "none") return write(["none"], gesture);
    write(list.map((s, i) => (i === index ? shadow : s)).filter((s) => s !== "none"), gesture);
  };

  const current = open !== null ? list[open] : undefined;
  return (
    <LayerList
      label={PROPERTY}
      class="box-shadow-editor"
      items={list.map(chipOf)}
      mixed={mixed}
      open={open}
      onOpen={setOpen}
      onAdd={add}
      onRemove={remove}
      noun="shadow"
      panelTitle="Box Shadow"
      focusRequest={props.focusRequest}
      footer={current && (current !== "none" && current.type !== "custom" && current.mode === "smooth" ? SMOOTH_HINT : TYPE_HINTS[typeOf(current)])}
    >
      {open !== null && current && <ShadowPanelRows {...props} shadow={current} onUpdate={(shadow, gesture) => update(open, shadow, gesture)} />}
    </LayerList>
  );
}

/** A number field's text, stepped or dragged: `delta` from it (or from `start` when empty), at least `min`, at most `max`. */
function stepNumber(text: string, delta: number, start: number, min: number, max = Number.POSITIVE_INFINITY): number {
  const n = Number.parseFloat(text);
  const from = Number.isFinite(n) ? n : start;
  return Math.min(max, Math.max(min, Math.round((from + delta) * 100) / 100));
}

/** The panel's rows for one shadow: its type and mode, then its parts. */
function ShadowPanelRows({
  element,
  shadow,
  onUpdate,
  onRevert,
}: PropertyEditorProps & { shadow: BoxShadow | "none"; onUpdate(shadow: BoxShadow | "none", gesture?: object): void }) {
  const type = typeOf(shadow);
  const revert = (gesture: object) => onRevert?.(PROPERTY, gesture);
  return (
    <>
      <PropertyRow label="type">
        <PropertySelect
          value={type}
          options={SHADOW_TYPES}
          label="shadow type"
          clearable={false}
          hintFor={(t) => TYPE_TAKES[t as ShadowType]}
          onChange={(t) => t !== type && t !== "custom" && onUpdate(asType(shadow, t as Exclude<ShadowType, "custom">))}
        />
      </PropertyRow>
      {shadow !== "none" && shadow.type !== "custom" && (
        <PropertyRow label="mode">
          <PropertySelect
            value={shadow.mode}
            options={SHADOW_MODES}
            label="shadow mode"
            clearable={false}
            onChange={(m) => {
              if (m === shadow.mode) return;
              onUpdate((m as ShadowMode) === "smooth" ? toSmooth(shadow as ManualShadow) : toManual(shadow as SmoothShadow));
            }}
          />
        </PropertyRow>
      )}
      {shadow !== "none" && shadow.type !== "custom" && shadow.mode === "manual" && (
        <ShadowRows
          element={element}
          lengths={LENGTHS}
          values={{ x: shadow.x, y: shadow.y, blur: shadow.blur, spread: shadow.spread, color: shadow.color }}
          onChange={(part, next, gesture) => onUpdate({ ...shadow, [part]: next }, gesture)}
          onRevert={revert}
        />
      )}
      {shadow !== "none" && shadow.type !== "custom" && shadow.mode === "smooth" && (
        <SmoothRows element={element} shadow={shadow} onUpdate={onUpdate} onRevert={revert} />
      )}
      {shadow !== "none" && shadow.type === "custom" && (
        <PropertyRow label="value">
          <PropertyInputText
            value={shadow.text}
            label="shadow value"
            placeholder="0 4px 6px #0000001a"
            onCommit={(text) => {
              const t = text.trim().replace(/\s+/g, " ");
              const valid = !t || typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports(PROPERTY, t);
              if (valid && t !== shadow.text) onUpdate({ type: "custom", text: t });
            }}
          />
        </PropertyRow>
      )}
    </>
  );
}

/**
 * A smooth shadow's rows: direction (an angle, so its drag handle is the
 * dial), distance (px), elevation (px), layers (1–MAX_LAYERS), and the color,
 * whose opacity is the stack's strength. Each steps (↑/↓, the wheel) and drags.
 */
function SmoothRows({
  element,
  shadow,
  onUpdate,
  onRevert,
}: {
  element: PropertyEditorProps["element"];
  shadow: SmoothShadow;
  onUpdate(shadow: BoxShadow, gesture?: object): void;
  onRevert(gesture: object): void;
}) {
  const { smooth } = shadow;
  const set = (part: Partial<Smooth>, gesture?: object) => onUpdate({ ...shadow, smooth: { ...smooth, ...part } }, gesture);
  /** A drag: from where it started, `steps` on; back at the start, the earlier value. */
  const drag = (apply: (steps: number, startText: string, gesture: object) => void) => (steps: number, startText: string, gesture: object) => {
    if (steps === 0) return void onRevert(gesture);
    apply(steps, startText, gesture);
  };
  return (
    <>
      <PropertyRow label="direction">
        <PropertyInputText
          value={`${smooth.direction}deg`}
          label="shadow direction"
          onCommit={(text) => {
            const angle = angleText(text);
            const deg = angle === null ? null : degreesOf(angle);
            if (deg !== null && deg !== smooth.direction) set({ direction: deg });
          }}
          onStep={(delta, text, gesture) => set({ direction: stepNumber(text, delta, smooth.direction, Number.NEGATIVE_INFINITY) }, gesture)}
          onScrub={drag((steps, start, gesture) => set({ direction: stepNumber(start, steps, smooth.direction, Number.NEGATIVE_INFINITY) }, gesture))}
        />
      </PropertyRow>
      <PropertyRow label="distance">
        <PropertyInputText
          value={`${smooth.distance}px`}
          label="shadow distance"
          onCommit={(text) => {
            const t = text.trim();
            const n = /^\d*\.?\d+$/.test(t) ? Number(t) : pxOf(t);
            if (n !== null && n >= 0 && n !== smooth.distance) set({ distance: n });
          }}
          onStep={(delta, text, gesture) => set({ distance: stepNumber(text, delta, smooth.distance, 0) }, gesture)}
          onScrub={drag((steps, start, gesture) => set({ distance: stepNumber(start, steps, smooth.distance, 0) }, gesture))}
        />
      </PropertyRow>
      <PropertyRow label="elevation">
        <PropertyInputText
          value={`${smooth.elevation}px`}
          label="shadow elevation"
          onCommit={(text) => {
            const t = text.trim();
            const n = /^\d*\.?\d+$/.test(t) ? Number(t) : pxOf(t);
            if (n !== null && n >= 0 && n !== smooth.elevation) set({ elevation: n });
          }}
          onStep={(delta, text, gesture) => set({ elevation: stepNumber(text, delta, smooth.elevation, 0) }, gesture)}
          onScrub={drag((steps, start, gesture) => set({ elevation: stepNumber(start, steps, smooth.elevation, 0) }, gesture))}
        />
      </PropertyRow>
      <PropertyRow label="layers">
        <PropertyInputText
          value={String(smooth.layers)}
          label="shadow layers"
          onCommit={(text) => {
            const n = /^\d+$/.test(text.trim()) ? Math.min(MAX_LAYERS, Math.max(1, Number(text.trim()))) : null;
            if (n !== null && n !== smooth.layers) set({ layers: n });
          }}
          onStep={(delta, text, gesture) => set({ layers: stepNumber(text, Math.sign(delta), smooth.layers, 1, MAX_LAYERS) }, gesture)}
          onScrub={drag((steps, start, gesture) => set({ layers: Math.round(stepNumber(start, steps / 4, smooth.layers, 1, MAX_LAYERS)) }, gesture))}
        />
      </PropertyRow>
      <ShadowRows
        element={element}
        lengths={[]}
        values={{ color: smooth.color }}
        onChange={(_part, next, gesture) => next && set({ color: next }, gesture)}
        onRevert={onRevert}
      />
    </>
  );
}

export const boxShadowEditor: PropertyEditor = {
  id: PROPERTY,
  label: "Box shadow",
  properties: [PROPERTY],
  // Tailwind's shadow-* and inset-shadow-* utilities (shadow-md, inset-shadow-sm…).
  aliases: ["shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-none", "inset-shadow-sm", "inset-shadow-none"],
  component: BoxShadowEditor,
};
