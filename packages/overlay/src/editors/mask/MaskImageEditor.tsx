import { useState } from "preact/hooks";
import { parseValue } from "../../css/values.ts";
import { Icon, type IconName } from "../../ui/components/Icon/Icon.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { LayerList } from "../../ui/components/LayerList/LayerList.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { tokensFor } from "../../ui/components/TokenMenu/tokens.ts";
import { declaredOf, isMixed } from "../declared.ts";
import { useScrub } from "../length/useScrub.ts";
import { stepField } from "../step.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import {
  angleText,
  DIRECTIONS,
  type Direction,
  formatMask,
  type Mask,
  MASK_TYPES,
  type MaskType,
  maskChanges,
  maskLayers,
  NEW_MASK,
  parseMask,
  POSITIONS,
  type Position,
  stopText,
} from "./mask.ts";

const PROPERTY = "mask-image";
/** The from/to fields parse, step and drag as a length or percentage that can be negative: text-indent's kind. */
const STOP = "text-indent";

const DIRECTION_ICONS: Record<Direction, IconName> = {
  "to top": "mask-to-top",
  "to top right": "mask-to-top-right",
  "to right": "mask-to-right",
  "to bottom right": "mask-to-bottom-right",
  "to bottom": "mask-to-bottom",
  "to bottom left": "mask-to-bottom-left",
  "to left": "mask-to-left",
  "to top left": "mask-to-top-left",
  "left and right": "mask-left-and-right",
  "top and bottom": "mask-top-and-bottom",
  angle: "object-custom",
};

const POSITION_ICONS: Record<Position, IconName> = {
  center: "object-center",
  "top left": "object-top-left",
  top: "object-top",
  "top right": "object-top-right",
  right: "object-right",
  "bottom right": "object-bottom-right",
  bottom: "object-bottom",
  "bottom left": "object-bottom-left",
  left: "object-left",
};

/** What each type looks like in its select: a mask of it, previewed. */
const TYPE_SAMPLES: Partial<Record<MaskType, Mask>> = {
  linear: { type: "linear", direction: "to bottom", angle: "", from: "", to: "" },
  radial: { type: "radial", at: "center", from: "", to: "" },
};

/**
 * A mask previewed: in the frame of the other mask icons, the accent masked
 * by it (its layers, intersected as the editor writes them), so each chip
 * shows its own direction and fade. A custom mask and none have icons of
 * their own (a custom one may be an image, which wouldn't read at 12px).
 */
function MaskSwatch({ mask }: { mask: Mask | "none" }) {
  if (mask === "none") return <Icon name="mask-none" />;
  if (mask.type === "custom") return <Icon name="mask-custom" />;
  const layers = maskLayers(mask);
  return (
    <span class="mask-swatch" aria-hidden="true">
      <span class="mask-fill" style={{ maskImage: layers.join(", "), maskComposite: layers.length > 1 ? "intersect" : undefined }} />
    </span>
  );
}

const typeOf = (mask: Mask | "none"): MaskType => (mask === "none" ? "none" : mask.type);

/** The mask as another type: a fade keeps its stops, custom starts from its CSS. */
function asType(mask: Mask | "none", type: MaskType): Mask | "none" {
  if (type === "none") return "none";
  const stops = mask !== "none" && mask.type !== "custom" ? { from: mask.from, to: mask.to } : { from: "50%", to: "" };
  if (type === "linear") return { type: "linear", direction: "to bottom", angle: "", ...stops };
  if (type === "radial") return { type: "radial", at: "center", ...stops };
  return { type: "custom", text: mask === "none" ? "" : maskLayers(mask).join(", ") };
}

/**
 * mask-image (the owner's design): the row lists the element's masks as
 * chips (LayerList: a preview, the type's name, × to take it off) and a +
 * that adds one. A mask is edited in a panel beside the dialog (PropertyPanel):
 * type first (linear, radial, custom, none), which decides the rows under
 * it. × clears the property (the element declares no mask); `none` declares
 * mask-image: none (to take a mask off at a width) and is the whole value.
 * Linear and radial masks write `mask-composite: intersect` with them, as
 * line-clamp writes its companions (maskChanges).
 */
function MaskImageEditor(props: PropertyEditorProps) {
  const value = declaredOf(props, PROPERTY);
  const mixed = isMixed(props, PROPERTY);
  const masks = mixed ? null : parseMask(value);
  const list: Array<Mask | "none"> = masks === "none" ? ["none"] : (masks ?? []);
  const [open, setOpen] = useState<number | null>(null);

  // Every write is the whole value, with its mask-composite, as one undo step.
  const write = (next: Array<Mask | "none">, gesture: object = {}) => {
    const v = next.includes("none") ? "none" : formatMask(next as Mask[]);
    for (const [p, val] of maskChanges(v, (p) => declaredOf(props, p))) props.onChange(p, val, { gesture });
  };
  const add = () => {
    const next = [...list.filter((m) => m !== "none"), NEW_MASK];
    write(next);
    setOpen(next.length - 1);
  };
  const remove = (index: number) => {
    const next = list.filter((_, i) => i !== index);
    if (next.length) write(next);
    else for (const [p, val] of maskChanges("", (p) => declaredOf(props, p))) props.onChange(p, val, { gesture: {} });
    setOpen(null);
  };
  const update = (index: number, mask: Mask | "none", gesture?: object) => {
    // `none` is the whole value: the other masks go.
    if (mask === "none") return write(["none"], gesture);
    write(list.map((m, i) => (i === index ? mask : m)).filter((m) => m !== "none"), gesture);
  };

  const current = open !== null ? list[open] : undefined;
  return (
    <LayerList
      label="mask-image"
      class="mask-image-editor"
      items={list.map((mask) => ({ name: typeOf(mask), swatch: <MaskSwatch mask={mask} /> }))}
      mixed={mixed}
      open={open}
      onOpen={setOpen}
      onAdd={add}
      onRemove={remove}
      noun="mask"
      panelTitle="Mask Image"
      focusRequest={props.focusRequest}
    >
      {open !== null && current && <MaskRows {...props} mask={current} onUpdate={(mask, gesture) => update(open, mask, gesture)} />}
    </LayerList>
  );
}

/** The panel's rows for one mask: its type, then what that type has. */
function MaskRows({
  mask,
  onUpdate,
  onRevert,
}: PropertyEditorProps & { mask: Mask | "none"; onUpdate(mask: Mask | "none", gesture?: object): void }) {
  const type = typeOf(mask);
  // From/to drag like any length (useScrub), into the mask.
  const scrub = useScrub({
    onChange: (stop, next, options) => mask !== "none" && mask.type !== "custom" && onUpdate({ ...mask, [stop]: next }, options?.gesture),
    onRevert: (_stop, gesture) => {
      onRevert?.(PROPERTY, gesture);
      onRevert?.("mask-composite", gesture);
    },
  });
  const stopRow = (stop: "from" | "to", placeholder: string) => {
    if (mask === "none" || mask.type === "custom") return null;
    return (
      <PropertyRow label={stop}>
        <PropertyInputText
          value={mask[stop]}
          label={`mask ${stop}`}
          placeholder={placeholder}
          tokens={tokensFor(STOP)}
          onCommit={(text) => {
            const t = stopText(text);
            const next = t ? parseValue(STOP, t) : "";
            if (next !== null && next !== mask[stop]) onUpdate({ ...mask, [stop]: next });
          }}
          onStep={(delta, text, gesture) => {
            const next = stepField(STOP, stopText(text) || placeholder, delta, placeholder);
            if (next) onUpdate({ ...mask, [stop]: next }, gesture);
          }}
          onScrub={(steps, startText, gesture) =>
            scrub({ property: STOP, writes: stop, base: () => placeholder }, steps, stopText(startText) || placeholder, gesture)
          }
        />
      </PropertyRow>
    );
  };
  return (
    <>
      <PropertyRow label="type">
        <PropertySelect
          value={type}
          options={MASK_TYPES}
          label="mask type"
          clearable={false}
          iconFor={(t) => {
            const sample = TYPE_SAMPLES[t as MaskType];
            if (sample) return <MaskSwatch mask={sample} />;
            return <Icon name={t === "custom" ? "mask-custom" : "mask-none"} />;
          }}
          onChange={(t) => t !== type && onUpdate(asType(mask, t as MaskType))}
        />
      </PropertyRow>
      {mask !== "none" && mask.type === "linear" && (
        <>
          <PropertyRow label="direction">
            <PropertySelect
              value={mask.direction}
              options={DIRECTIONS}
              label="mask direction"
              clearable={false}
              iconFor={(d) => <Icon name={DIRECTION_ICONS[d as Direction]} />}
              onChange={(d) => d !== mask.direction && onUpdate({ ...mask, direction: d as Direction, angle: d === "angle" ? mask.angle || "180deg" : "" })}
            />
          </PropertyRow>
          {mask.direction === "angle" && (
            <PropertyRow label="angle">
              <PropertyInputText
                value={mask.angle}
                label="mask angle"
                placeholder="180deg"
                onCommit={(text) => {
                  const next = angleText(text);
                  if (next && next !== mask.angle) onUpdate({ ...mask, angle: next });
                }}
                onStep={(delta, text, gesture) => {
                  const m = /^(-?\d*\.?\d+)(deg|turn|rad|grad)?$/.exec((text || "180deg").trim());
                  if (!m) return;
                  const unit = m[2] ?? "deg";
                  const step = unit === "deg" ? delta : unit === "grad" ? delta : delta / 100;
                  onUpdate({ ...mask, angle: `${Math.round((Number(m[1]) + step) * 100) / 100}${unit}` }, gesture);
                }}
              />
            </PropertyRow>
          )}
        </>
      )}
      {mask !== "none" && mask.type === "radial" && (
        <PropertyRow label="position">
          <PropertySelect
            value={mask.at}
            options={POSITIONS}
            label="mask position"
            clearable={false}
            iconFor={(p) => <Icon name={POSITION_ICONS[p as Position]} />}
            onChange={(p) => p !== mask.at && onUpdate({ ...mask, at: p as Position })}
          />
        </PropertyRow>
      )}
      {stopRow("from", "0%")}
      {stopRow("to", "100%")}
      {mask !== "none" && mask.type === "custom" && (
        <PropertyRow label="value">
          <PropertyInputText
            value={mask.text}
            label="mask value"
            placeholder="url(…)"
            onCommit={(text) => {
              const t = text.trim();
              const valid = !t || typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports(PROPERTY, t);
              if (valid && t !== mask.text) onUpdate({ type: "custom", text: t });
            }}
          />
        </PropertyRow>
      )}
    </>
  );
}

export const maskImageEditor: PropertyEditor = {
  id: PROPERTY,
  label: "Mask image",
  properties: [PROPERTY],
  // It writes mask-composite with its fades (maskChanges).
  reads: ["mask-composite"],
  // Tailwind's mask utilities: mask-linear-*, mask-radial-*, and the edge fades (mask-t-from-50%, mask-x-…).
  aliases: ["mask", "mask-linear", "mask-radial", "mask-t", "mask-r", "mask-b", "mask-l", "mask-x", "mask-y"],
  component: MaskImageEditor,
};
