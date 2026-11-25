import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { parseColor, parseOpacity, splitColor } from "../../../css/colors.ts";
import { bareToken } from "../../../css/values.ts";
import { Icon } from "../Icon/Icon.tsx";
import { tokensFor } from "../TokenMenu/tokens.ts";
import {
  type Color,
  type Hsv,
  type Oklch,
  colorOf,
  formatOklch,
  fromHsv,
  fromOklch,
  hexOf,
  maxChroma,
  oklabToRgb,
  sameRgb,
  toHsv,
  toOklch,
} from "../../../css/colorSpace.ts";
import { PropertyInputText } from "../PropertyInputText/PropertyInputText.tsx";
import { PropertyPanel } from "../PropertyPanel/PropertyPanel.tsx";
import { PropertyRow } from "../PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../PropertySelect/PropertySelect.tsx";

/** How the fields write the color: OKLCH (lightness, chroma, hue) or a hex. */
export type ColorModel = "OKLCH" | "Hex";
const MODELS: readonly ColorModel[] = ["OKLCH", "Hex"];

/** The model last picked (this page), for the next picker on a color not written in OKLCH. */
let lastModel: ColorModel = "Hex";
/** OKLCH as lightness, chroma and hue rows rather than one value: as last left (this page). */
let lastSplit = false;

interface ColorPickerProps {
  /** The property the color is for (`color`, `border-color`): which variables its value field offers. */
  property: string;
  /** The color as the element declares it (`#ff0000`, `oklch(…)`, `var(--brand)`), "" for none. */
  color: string;
  /** What it computes to (any CSS color): what the picker starts from when `color` can't be read (a var()). */
  computed: string;
  /** 0–100; null for none (100). */
  opacity: number | null;
  /** A color picked: its CSS (a hex or oklch()) and opacity, one undo step per `gesture` (a drag). */
  onPick(color: string, opacity: number, gesture?: object): void;
  /** A drag back where it started: the earlier value, not a fake edit. */
  onRevert(gesture: object): void;
  onClose(): void;
  /** The trigger (the swatch): clicking it doesn't count as a click outside. */
  trigger(): Element | null;
  /** What it opens beside (the dialog, or the panel the field is in), and the row it's for. */
  beside(): DOMRect | null;
  anchor(): DOMRect | null;
}

/**
 * Where a picker opened from `el` (a swatch) goes: beside the panel the field
 * is in (a shadow's color), else the property dialog; level with its row.
 */
export function pickerPlace(el: () => Element | null) {
  return {
    beside: () => (el()?.closest(".property-panel") ?? el()?.closest(".property-dialog"))?.getBoundingClientRect() ?? null,
    anchor: () => el()?.closest(".property-row")?.getBoundingClientRect() ?? null,
  };
}

/** The most chroma the OKLCH field takes: past every sRGB color (blue's is ~0.31), as oklch.com's. */
const CHROMA_MAX = 0.37;

/** The OKLCH hue strip's colors: every hue at one vivid lightness and chroma (lowered where sRGB can't show it). */
const STRIP = { l: 0.75, c: 0.16 };
const OKLCH_STRIP = `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => hexOf(fromOklch({ ...STRIP, h: i * 30 }))).join(", ")})`;

/**
 * The OKLCH area: lightness top to bottom (1 to 0), and on each row chroma
 * left to right from 0 to the most sRGB shows at that lightness and hue
 * (maxChroma), so it's a full rectangle of colors the screen shows, its
 * right edge the gamut's (DialKit's way; first the chroma went to a fixed
 * 0.37, leaving most of a hue's area empty). Drawn pixel by pixel at `hue`,
 * redrawn when it changes.
 */
function OklchArea({ hue }: { hue: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    // Half the area's CSS size, scaled up smoothly: its colors are gradients, with no edges to blur,
    // and a quarter of the pixels keeps a redraw (each hue a drag passes) to a couple of ms.
    const width = Math.max(1, Math.round(el.clientWidth / 2));
    const height = Math.max(1, Math.round(el.clientHeight / 2));
    if (el.width !== width) el.width = width;
    if (el.height !== height) el.height = height;
    const image = ctx.createImageData(width, height);
    const data = image.data;
    const rad = (hue * Math.PI) / 180;
    const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
    const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
    for (let y = 0; y < height; y++) {
      const l = 1 - (y + 0.5) / height;
      const most = maxChroma(l, hue);
      for (let x = 0; x < width; x++) {
        const c = ((x + 0.5) / width) * most;
        const rgb = oklabToRgb(l, c * cos, c * sin);
        const i = (y * width + x) * 4;
        data[i] = byte(rgb.r);
        data[i + 1] = byte(rgb.g);
        data[i + 2] = byte(rgb.b);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [Math.round(hue * 2) / 2]);
  return <canvas class="color-area-canvas" ref={canvas} aria-hidden="true" />;
}

/** Each field's step (↑/↓, a drag's pixel) and range. */
const FIELDS = {
  lightness: { step: 0.01, min: 0, max: 1, digits: 3 },
  chroma: { step: 0.005, min: 0, max: CHROMA_MAX, digits: 3 },
  hue: { step: 1, min: 0, max: 360, digits: 1 },
} as const;

/** The color as the picker reads it: its declared text when it can, else what it computes to; black when neither. */
function readColor(color: string, computed: string): Color {
  return colorOf(color) ?? colorOf(computed) ?? { rgb: { r: 0, g: 0, b: 0 }, alpha: 1 };
}

/**
 * The color picker (the owner's design): a panel beside the dialog with no
 * header (PropertyPanel, `header={false}`), as wide as it, dragged by the
 * strip along its top as the other panels. 16px from its sides and top, the
 * area with a handle, and right under it the hue strip with its own (the
 * owner's pick: every model can reach every hue by dragging), both in the
 * model's terms: in Hex, saturation × brightness at the HSV hue; in OKLCH,
 * chroma × lightness at OKLCH's hue (OklchArea), so the strip and the hue
 * field say the same (the owner's call; HSV's hue isn't OKLCH's). Then the
 * dialog's usual rows: **model** (OKLCH or Hex), its fields (lightness,
 * chroma, hue; or the hex value), and **opacity**.
 *
 * A drag is one undo step. It writes in the model: a hex (`#rrggbb`), or
 * `oklch(L C H)`; an opacity below 100 as css/colors.ts joins it (8-digit
 * hex, `oklch(… / 50%)`). A gray keeps the hue it had (a gray has none), so
 * the strip's handle doesn't jump. It closes on Esc, or a click outside it
 * and its trigger.
 */
export function ColorPicker({ property, color, computed, opacity, onPick, onRevert, onClose, trigger, beside, anchor }: ColorPickerProps) {
  const read = readColor(color, computed);
  const alpha = opacity ?? Math.round(read.alpha * 100);
  const [model, setModel] = useState<ColorModel>(() => (/^oklch\(/i.test(color.trim()) ? "OKLCH" : lastModel));
  const [split, setSplit] = useState(lastSplit);
  // A variable (`var(--brand)`): the value field shows its name, the rest its color (computed).
  const variable = /^var\(/i.test(color.trim());
  // The area's color: HSV, so a gray keeps its hue and a black its saturation.
  const [hsv, setHsv] = useState<Hsv>(() => toHsv(read.rgb));
  // The color changed elsewhere (a field, undo): the area follows, keeping what a gray can't say.
  useEffect(() => {
    if (sameRgb(fromHsv(hsv), read.rgb)) return;
    const next = toHsv(read.rgb);
    setHsv({ h: next.s < 1e-3 || next.v < 1e-3 ? hsv.h : next.h, s: next.v < 1e-3 ? hsv.s : next.s, v: next.v });
  }, [hexOf(read.rgb)]);
  // OKLCH's own values: as written when the color is oklch(), else from its sRGB (a gray keeps the hue it had).
  const lastHue = useRef(0);
  const oklch: Oklch = read.oklch ?? (() => {
    const o = toOklch(read.rgb);
    return o.c < 1e-4 ? { ...o, h: lastHue.current } : o;
  })();
  lastHue.current = oklch.h;

  const panel = useRef<HTMLDivElement>(null);
  // A click outside the picker and its trigger closes it (in the page or in Pilot's own UI).
  useEffect(() => {
    const root = panel.current?.getRootNode();
    const onDown = (e: Event) => {
      const path = e.composedPath();
      const inside = (el: Element | null | undefined) => !!el && path.includes(el);
      if (inside(panel.current?.closest(".property-panel")) || inside(trigger())) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    if (root instanceof ShadowRoot) root.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      if (root instanceof ShadowRoot) root.removeEventListener("pointerdown", onDown, true);
    };
  }, []);

  const pickOklch = (next: Oklch, gesture?: object) => onPick(formatOklch(next), alpha, gesture);
  /**
   * A spot on the area or the strip (0–1 across and down), in the model: in
   * Hex, saturation × brightness and the HSV hue; in OKLCH, chroma ×
   * lightness and OKLCH's hue, so the strip and the hue field agree.
   */
  const pickAt = (on: "area" | "hue", x: number, y: number, gesture: object) => {
    if (model === "OKLCH") {
      // The area's chroma is relative: x of the most this lightness and hue can show (OklchArea).
      // Another hue keeps the handle's spot: the same share of the most chroma there (in the screen's colors still).
      const h = Math.min(359.9, x * 360);
      const share = (c: number, hue: number) => {
        const most = maxChroma(oklch.l, hue);
        return most ? Math.min(1, c / most) : 0;
      };
      const next =
        on === "area"
          ? { ...oklch, l: 1 - y, c: x * maxChroma(1 - y, oklch.h) }
          : { ...oklch, h, c: oklch.c && share(oklch.c, oklch.h) * maxChroma(oklch.l, h) };
      return pickOklch(next, gesture);
    }
    const next = on === "area" ? { h: hsv.h, s: x, v: 1 - y } : { ...hsv, h: Math.min(359.9, x * 360) };
    setHsv(next);
    onPick(hexOf(fromHsv(next)), alpha, gesture);
  };
  // A drag calls the latest: the color it compares with has changed since it started.
  const latestPick = useRef(pickAt);
  latestPick.current = pickAt;

  /** A drag on the area or the strip: one undo step, from where it's pressed. */
  const drag = (on: "area" | "hue") => (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    const gesture = {};
    const box = el.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }) => {
      const x = Math.min(1, Math.max(0, (ev.clientX - box.left) / (box.width || 1)));
      const y = Math.min(1, Math.max(0, (ev.clientY - box.top) / (box.height || 1)));
      latestPick.current(on, x, y, gesture);
    };
    at(e);
    // One change a frame: moves between frames only say where the pointer is now.
    let pending: { clientX: number; clientY: number } | null = null;
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (pending) at(pending);
      pending = null;
    };
    const move = (ev: PointerEvent) => {
      pending = { clientX: ev.clientX, clientY: ev.clientY };
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const up = () => {
      if (frame) cancelAnimationFrame(frame);
      flush();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  /** A number field of OKLCH: typed, stepped, dragged. */
  const oklchField = (name: keyof typeof FIELDS, action?: ComponentChildren) => {
    const { step, min, max, digits } = FIELDS[name];
    const key = name === "lightness" ? "l" : name === "chroma" ? "c" : "h";
    const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(digits))));
    const set = (n: number, gesture?: object) => pickOklch({ ...oklch, [key]: name === "hue" ? ((n % 360) + 360) % 360 : clamp(n) }, gesture);
    return (
      <PropertyRow key={name} label={name} action={action}>
        <PropertyInputText
          value={String(Number(oklch[key].toFixed(digits)))}
          label={name}
          onCommit={(text) => {
            const n = Number.parseFloat(text);
            if (Number.isFinite(n)) set(n);
          }}
          onStep={(delta, text, gesture) => set((Number.parseFloat(text) || 0) + delta * step, gesture)}
          onScrub={(steps, startText, gesture) => {
            const start = Number.parseFloat(startText) || 0;
            const next = name === "hue" ? start + steps * step : clamp(start + steps * step);
            if (next === start) onRevert(gesture);
            else set(next, gesture);
            return name === "hue" ? 0 : (start + steps * step - next) / step;
          }}
        />
      </PropertyRow>
    );
  };

  const hex = hexOf(fromHsv(hsv)).toUpperCase();
  // OKLCH: one value, or lightness, chroma and hue (border-radius's split button; the icon a placeholder).
  const splitButton = (
    <span class="split-editor">
      <button
        type="button"
        class="split-toggle"
        aria-label={split ? "One value for the color" : "Lightness, chroma and hue apart"}
        aria-pressed={split}
        title={split ? "One value" : "Split"}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          lastSplit = !split;
          setSplit(!split);
        }}
      >
        <Icon name="color-split" />
      </button>
    </span>
  );
  const rows = (
    <>
      <PropertyRow label="model">
        <PropertySelect
          value={model}
          options={MODELS}
          label="color model"
          clearable={false}
          onChange={(next) => {
            lastModel = next as ColorModel;
            setModel(next as ColorModel);
          }}
        />
      </PropertyRow>
      {model === "OKLCH" && split ? (
        // Split: a row each, the button on the first (the others keep its room, so the fields line up).
        (["lightness", "chroma", "hue"] as const).map((name, i) => oklchField(name, i === 0 ? splitButton : <span aria-hidden="true" />))
      ) : (
        <PropertyRow label="value" action={model === "OKLCH" ? splitButton : undefined}>
          <PropertyInputText
            value={variable ? bareToken(color) : model === "Hex" ? hex : formatOklch(oklch)}
            label="color value"
            tokens={tokensFor(property)}
            onCommit={commitValue}
          />
        </PropertyRow>
      )}
      <PropertyRow label="opacity">
        <PropertyInputText
          value={`${alpha}%`}
          label="opacity"
          onCommit={(text) => {
            const o = parseOpacity(text);
            if (o !== null) onPick(currentText(), o);
          }}
          onStep={(delta, text, gesture) => onPick(currentText(), Math.min(100, Math.max(0, (parseOpacity(text) ?? alpha) + delta)), gesture)}
          onScrub={(steps, startText, gesture) => {
            const start = parseOpacity(startText) ?? alpha;
            const next = Math.min(100, Math.max(0, start + steps));
            if (next === start) onRevert(gesture);
            else onPick(currentText(), next, gesture);
            return start + steps - next;
          }}
        />
      </PropertyRow>
    </>
  );

  /** The color as the model writes it, for an opacity change (a variable stays one). */
  function currentText(): string {
    if (variable) return color;
    return model === "Hex" ? hexOf(fromHsv(hsv)) : formatOklch(oklch);
  }

  /**
   * A color typed (or a variable picked) in the value field: a variable is
   * written as it is; any other CSS color in the model (a hex, oklch()), so
   * `oklch(…)` pasted in Hex comes out a hex. Typed with its alpha (8-digit
   * hex, `/ 50%`), it sets the opacity too.
   */
  function commitValue(text: string) {
    const typed = parseColor(text);
    if (!typed) return;
    if (/^var\(/i.test(typed)) return onPick(typed, alpha);
    const parsed = colorOf(typed);
    if (!parsed) return;
    const o = parsed.alpha < 1 ? Math.round(parsed.alpha * 100) : alpha;
    onPick(model === "Hex" ? hexOf(parsed.rgb) : formatOklch(parsed.oklch ?? toOklch(parsed.rgb)), o);
  }

  // The handles: where the color is on the model's area and strip.
  const oklchMode = model === "OKLCH";
  // In OKLCH, a chroma past what the screen shows (typed, or another model's) sits at the right edge.
  const most = oklchMode ? maxChroma(oklch.l, oklch.h) : 0;
  const spot = oklchMode ? { x: most ? Math.min(1, oklch.c / most) : 0, y: 1 - oklch.l } : { x: hsv.s, y: 1 - hsv.v };
  const hueAt = (oklchMode ? oklch.h : hsv.h) / 360;
  const area = (
    <div class="color-picker" ref={panel} data-model={model}>
      <div class="color-area" style={{ "--_hue": String(hsv.h) }} onPointerDown={drag("area")}>
        {oklchMode && <OklchArea hue={oklch.h} />}
        <span
          class="color-handle"
          style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, "--_color": oklchMode ? hexOf(fromOklch(oklch)) : hex }}
        />
      </div>
      <div class="hue-strip" style={oklchMode ? { background: OKLCH_STRIP } : undefined} onPointerDown={drag("hue")}>
        <span
          class="hue-handle"
          style={{ left: `${hueAt * 100}%`, "--_color": oklchMode ? hexOf(fromOklch({ ...STRIP, h: oklch.h })) : `hsl(${hsv.h} 100% 50%)` }}
        />
      </div>
    </div>
  );

  return (
    <PropertyPanel title="Color" header={false} top={area} beside={beside} anchor={anchor} onClose={onClose}>
      {rows}
    </PropertyPanel>
  );
}
