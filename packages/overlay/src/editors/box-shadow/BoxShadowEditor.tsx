import { useRef, useState } from "preact/hooks";
import { LayerList } from "../../ui/components/LayerList/LayerList.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { Icon, type IconName } from "../../ui/components/Icon/Icon.tsx";
import { declaredOf, isMixed } from "../declared.ts";
import { useHeldDrag } from "../heldDrag.ts";
import { BLUR, OFFSET, ShadowRows } from "../shadow/ShadowRows.tsx";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import { closeParens } from "../../css/values.ts";
import { angleText } from "../mask/mask.ts";
import { degreesOf } from "../../ui/components/ScrubHandle/ScrubHandle.tsx";
import {
  type BoxShadow,
  formatBoxShadow,
  shadowText,
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
import { MAX_LAYERS, MIN_LAYERS, NEW_SMOOTH, type Smooth, SPREAD_RATIO, pxOf } from "./smooth.ts";

const PROPERTY = "box-shadow";

/** The length rows: x, y, blur, spread. */
const LENGTHS = [
  { part: "x", kind: OFFSET },
  { part: "y", kind: OFFSET },
  { part: "blur", kind: BLUR },
  { part: "spread", kind: OFFSET },
] as const;

const typeOf = (shadow: BoxShadow | "none"): ShadowType => (shadow === "none" ? "none" : shadow.type);

/** Which icon a shadow gets: its kind, or a ring for a manual one that's just a 1px spread. */
type SwatchLook = "outer" | "inset" | "ring" | "inset-ring" | "plain";

const LOOK_ICONS: Record<SwatchLook, IconName> = {
  outer: "shadow-outer",
  inset: "shadow-inset",
  ring: "shadow-outer-ring",
  "inset-ring": "shadow-inset-ring",
  plain: "shadow-custom",
};

export function swatchLook(shadow: BoxShadow): SwatchLook {
  if (shadow.type === "custom") return "plain";
  if (shadow.mode === "manual") {
    const zero = (v: string) => (pxOf(v) ?? Number.NaN) === 0;
    if (zero(shadow.x) && zero(shadow.y) && zero(shadow.blur) && pxOf(shadow.spread) === 1) return shadow.type === "inset" ? "inset-ring" : "ring";
  }
  return shadow.type;
}

/**
 * A shadow's icon (the owner's): its kind's; none, mask's none icon (the red
 * line). In a 12px slot, its frame on the other icons' (BoxShadowEditor.css).
 */
function ShadowSwatch({ shadow }: { shadow: BoxShadow | "none" }) {
  if (shadow === "none") return <Icon name="mask-none" />;
  const look = swatchLook(shadow);
  return (
    <span class="shadow-icon" data-look={look} aria-hidden="true">
      <Icon name={LOOK_ICONS[look]} />
    </span>
  );
}

/** A chip: the type, then its lengths dimmed (`outer 0 4px 6px -1px`), or just `smooth` for a smooth one (`outer smooth`). Manual and custom ones show their whole value on hover. */
function chipOf(shadow: BoxShadow | "none") {
  const swatch = <ShadowSwatch shadow={shadow} />;
  if (shadow === "none") return { name: "none", swatch };
  if (shadow.type === "custom") return { name: "custom", hint: shadow.text, tooltip: shadow.text, swatch };
  if (shadow.mode === "smooth") return { name: shadow.type, hint: "smooth", swatch };
  const lengths = [shadow.x || "0px", shadow.y || "0px", shadow.blur, shadow.spread].filter(Boolean);
  // The chip cuts it, and leaves the color out: hovered, the whole value.
  return { name: shadow.type, hint: lengths.join(" "), tooltip: shadowText(shadow), swatch };
}

/**
 * A shadow of another type: outer and inset keep their mode and parts (from
 * none or custom, a new one's); custom starts from the shadow's CSS (from
 * none, a new one's), so it's never empty.
 */
function asType(shadow: BoxShadow | "none", type: ShadowType): BoxShadow | "none" {
  if (type === "none") return "none";
  if (type === "custom") return { type: "custom", text: shadowText(shadow === "none" ? NEW_SHADOW : shadow) };
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
  const px = (n: number) => (Math.abs(n) < 0.005 ? "0px" : `${Math.round(n * 100) / 100}px`);
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
  // Shadows picked as custom: their CSS may well split into parts again
  // (read back as outer), so they're shown as custom while the editor's open.
  const customs = useRef(new Set<number>());
  const read: Array<BoxShadow | "none"> = shadows === "none" ? ["none"] : (shadows ?? []);
  const list = read.map((shadow, i): BoxShadow | "none" => {
    if (customs.current.has(i) && shadow !== "none" && shadow.type !== "custom") return { type: "custom", text: shadowText(shadow) };
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
    customs.current.clear();
    const next = list.filter((_, i) => i !== index);
    if (next.length) write(next);
    else props.onChange(PROPERTY, "", { gesture: {} });
    setOpen(null);
  };
  const update = (index: number, shadow: BoxShadow | "none", gesture?: object) => {
    if (shadow !== "none" && shadow.type !== "custom" && shadow.mode === "smooth") directions.current.set(index, shadow.smooth.direction);
    else directions.current.delete(index);
    if (shadow !== "none" && shadow.type === "custom") customs.current.add(index);
    else customs.current.delete(index);
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
      // `none` is the whole value: nothing can be added to it (× takes it off).
      noAdd={shadows === "none"}
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
          iconFor={(t) => <ShadowSwatch shadow={t === "none" ? "none" : t === "custom" ? { type: "custom", text: "" } : { ...NEW_SHADOW, type: t as "outer" | "inset" }} />}
          onChange={(t) => t !== type && onUpdate(asType(shadow, t as ShadowType))}
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
            placeholder="var(--shadow-md)"
            // The page's shadow variables (Tailwind's --shadow-md…): typed with --, or from the menu.
            tokens={{ kinds: ["shadow"], property: PROPERTY }}
            onCommit={(text) => {
              const t = closeParens(text.trim().replace(/\s+/g, " "));
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
  const held = useHeldDrag();
  /**
   * A drag: from where it started (`fallback` when the field has no number), `per` a step, held
   * between `min` and `max` (past them, the handle stretches); back at the start, the earlier value.
   */
  const drag =
    (fallback: number, apply: (n: number, gesture: object) => void, { per = 1, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) =>
    (steps: number, startText: string, gesture: object) => {
      const n = Number.parseFloat(startText);
      const from = Number.isFinite(n) ? n : fallback;
      const { offset, overflow } = held(gesture, steps, from, per, min, max);
      if (offset === 0) onRevert(gesture);
      else apply(Math.round((from + offset * per) * 100) / 100, gesture);
      return overflow;
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
          onScrub={drag(smooth.direction, (direction, gesture) => set({ direction }, gesture))}
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
          onScrub={drag(smooth.distance, (distance, gesture) => set({ distance }, gesture), { min: 0 })}
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
          onScrub={drag(smooth.elevation, (elevation, gesture) => set({ elevation }, gesture), { min: 0 })}
        />
      </PropertyRow>
      <PropertyRow label="layers">
        <PropertyInputText
          value={String(smooth.layers)}
          label="shadow layers"
          onCommit={(text) => {
            const n = /^\d+$/.test(text.trim()) ? Math.min(MAX_LAYERS, Math.max(MIN_LAYERS, Number(text.trim()))) : null;
            if (n !== null && n !== smooth.layers) set({ layers: n });
          }}
          onStep={(delta, text, gesture) => set({ layers: stepNumber(text, Math.sign(delta), smooth.layers, MIN_LAYERS, MAX_LAYERS) }, gesture)}
          // A layer every 4 steps.
          onScrub={drag(smooth.layers, (layers, gesture) => set({ layers: Math.round(layers) }, gesture), { per: 1 / 4, min: MIN_LAYERS, max: MAX_LAYERS })}
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
