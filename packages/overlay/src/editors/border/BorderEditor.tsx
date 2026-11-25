import { useRef, useState } from "preact/hooks";
import { joinColor, splitColor } from "../../css/colors.ts";
import { ColorPicker, pickerPlace } from "../../ui/components/ColorPicker/ColorPicker.tsx";
import { BORDER_STYLE_VALUES } from "../../css/properties.ts";
import { displayValue, parseValue } from "../../css/values.ts";
import { Icon, type IconName } from "../../ui/components/Icon/Icon.tsx";
import { Tooltip } from "../../ui/components/Tooltip/Tooltip.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { tokensFor } from "../../ui/components/TokenMenu/tokens.ts";
import { declaredOf, isFromReset, isMixed, MIXED } from "../declared.ts";
import { stepField } from "../step.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];
/** Where the border goes: every side (the default), or one. */
type Where = "all" | Side;
const WHERE: readonly Where[] = ["all", ...SIDES];

/** Border's own icons (the owner's): the frame, in the accent where the border is. */
const WHERE_ICONS: Record<Where, IconName> = {
  all: "border-all",
  top: "border-top",
  right: "border-right",
  bottom: "border-bottom",
  left: "border-left",
};

/** Each style's icon (derived placeholders, Icon.tsx); none and hidden draw nothing. */
const STYLE_ICONS: Record<string, IconName> = {
  solid: "border-solid",
  dashed: "border-dashed",
  dotted: "border-dotted",
  double: "border-double",
  hidden: "mask-none",
  none: "mask-none",
};

/** The properties a border on `where` is written with: the shorthands for every side, a side's longhands for one. */
function propertiesAt(where: Where) {
  const at = where === "all" ? "border" : `border-${where}`;
  return { width: `${at}-width`, style: `${at}-style`, color: `${at}-color` };
}

/** Every property the editor reads and writes: the shorthands, then each side's longhands. */
const ALL_PROPERTIES = WHERE.flatMap((where) => Object.values(propertiesAt(where)));

/** The style a width comes with when none is set (what Tailwind's `border` gives): without one, a width draws nothing. */
const NEW_STYLE = "solid";

/**
 * border (the owner's, to try): one row. The width (no drag handle: no room for it; a reset's value dimmed),
 * the style (a 24px button showing its icon, the menu listing them) and the
 * color (a 24px swatch, which opens the color picker), joined by 1px lines as the
 * color field's parts are. On the right, border-radius's split button
 * (split-toggle, SplitEditor.css): one line for every side (border-width…),
 * or a line per side (top, right, bottom, left: border-top-width…), the
 * button then showing the four sides' icons. Switching changes nothing on
 * the page; it opens on the sides when they differ (Tailwind's `border-b`).
 * On every side, a field shows the sides' value when they match (else
 * "Mixed", empty), and cleared, it's cleared on each side too. A width set
 * with no style comes with solid (else it draws nothing).
 */
function BorderEditor(props: PropertyEditorProps) {
  // A side's own value, else the shorthand's (a var() in it doesn't split into the sides).
  const read = (where: Where) => {
    const at = propertiesAt(where);
    const all = propertiesAt("all");
    const value = (p: keyof typeof at) => declaredOf(props, at[p]) || (where === "all" ? "" : declaredOf(props, all[p]));
    return { width: value("width"), style: value("style"), color: value("color") };
  };
  type Part = keyof ReturnType<typeof read>;
  const sidesMatch = (part: Part) =>
    SIDES.every((side) => read(side)[part] === read("top")[part]) && !SIDES.some((side) => isMixed(props, propertiesAt(side)[part]));
  const same = (["width", "style", "color"] as Part[]).every(sidesMatch);
  const [view, setView] = useState<"all" | "sides">(same ? "all" : "sides");

  const toggle = (
    <Tooltip text={view === "all" ? "Split" : "One value"}>
      <button
        type="button"
        class="split-toggle"
        aria-label={view === "all" ? "Set each side of border" : "One value for all of border"}
        aria-pressed={view === "sides"}
        tabIndex={-1}
        // Keep focus where it is (a field, or the search) while clicking.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setView(view === "all" ? "sides" : "all")}
      >
        {view === "all" ? <Icon name={WHERE_ICONS.all} /> : SIDES.map((side) => <Icon key={side} name={WHERE_ICONS[side]} />)}
      </button>
    </Tooltip>
  );

  return (
    <div class="split-editor border-editor" data-view={view}>
      {view === "all" ? (
        <PropertyRow label="border" action={toggle}>
          <BorderLine {...props} where="all" read={read} sidesMatch={sidesMatch} />
        </PropertyRow>
      ) : (
        <PropertyRow
          // Each side's own label, level with its line (border-top…), as inset's and padding's.
          label={
            <span class="row-labels">
              {SIDES.map((side) => (
                <span key={side}>{`border-${side}`}</span>
              ))}
            </span>
          }
          class="parts"
          action={toggle}
        >
          <div class="stack">
            {SIDES.map((side) => (
              <BorderLine key={side} {...props} where={side} read={read} sidesMatch={sidesMatch} />
            ))}
          </div>
        </PropertyRow>
      )}
    </div>
  );
}

/** One line: the width, the style and the color of `where`. */
function BorderLine({
  where,
  read,
  sidesMatch,
  ...props
}: PropertyEditorProps & {
  where: Where;
  read(where: Where): { width: string; style: string; color: string };
  sidesMatch(part: "width" | "style" | "color"): boolean;
}) {
  const at = propertiesAt(where);
  const all = where === "all";
  // On every side: the sides' value when they match, else empty ("Mixed").
  const shown = (part: "width" | "style" | "color") => (all ? (sidesMatch(part) ? read("top")[part] || read("all")[part] : "") : read(where)[part]);
  const mixedAt = (part: "width" | "style" | "color") => (all ? !sidesMatch(part) : isMixed(props, at[part]));
  // A width only a reset gives (Tailwind's `border: 0 solid`): shown dimmed, as the placeholder (the owner's call).
  const widthProperty = all || declaredOf(props, at.width) ? at.width : propertiesAt("all").width;
  const widthFromReset = isFromReset(props, widthProperty);
  const width = shown("width");
  // A style only a reset gives (Tailwind's `border: 0 solid`) shows as not set: "Select", dimmed.
  const styleProperty = all || declaredOf(props, at.style) ? at.style : propertiesAt("all").style;
  const drawnStyle = shown("style");
  const style = isFromReset(props, styleProperty) ? "" : drawnStyle;
  const color = shown("color");
  const name = all ? "border" : `border ${where}`;
  // The swatch opens the color picker.
  const [picking, setPicking] = useState(false);
  const colorRef = useRef<HTMLButtonElement>(null);

  /** A value here; on every side, cleared, each side's too (one undo step). */
  const write = (part: "width" | "style" | "color", next: string, gesture: object = {}) => {
    props.onChange(at[part], next, { gesture });
    if (all && next === "") for (const side of SIDES) props.onChange(propertiesAt(side)[part], "", { gesture });
  };
  // A width with no style: solid too, the same undo step.
  const writeWidth = (next: string, gesture: object = {}) => {
    write("width", next, gesture);
    // (A reset's solid counts: the border draws with it.)
    if (next && !drawnStyle) props.onChange(at.style, NEW_STYLE, { gesture });
  };

  return (
    <>
      <div class="border-line">
        <PropertyInputText
          value={width && !widthFromReset ? displayValue(width, at.width) : ""}
          label={`${name} width`}
          placeholder={mixedAt("width") ? MIXED : width ? displayValue(width, at.width) : "0"}
          tokens={tokensFor(at.width)}
          computed={props.values?.[at.width]}
          onCommit={(text) => {
            const next = text.trim() ? parseValue(at.width, text) : "";
            if (next !== null && (next !== width || mixedAt("width"))) writeWidth(next);
          }}
          onStep={(delta, text, gesture) => {
            const next = stepField(at.width, text || "0px", delta, "0px");
            if (next && next !== width) writeWidth(next, gesture);
          }}
          onSubmit={props.onReturnToSearch}
        />
        <PropertySelect
          value={style}
          options={BORDER_STYLE_VALUES}
          label={`${name} style`}
          placeholder={mixedAt("style") ? MIXED : undefined}
          iconOnly
          // No style set ("Select"): the solid line, dimmed.
          iconFor={(s) =>
            s ? (
              <Icon name={STYLE_ICONS[s] ?? "border-solid"} />
            ) : (
              <span class="style-unset">
                <Icon name="border-solid" />
              </span>
            )
          }
          onChange={(next) => (next !== style || mixedAt("style")) && write("style", next)}
        />
        <button
          type="button"
          class="border-color field-box"
          ref={colorRef}
          aria-label={`${name} color`}
          aria-expanded={picking}
          title={mixedAt("color") ? MIXED : color || "currentcolor"}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPicking(!picking)}
        >
          <span class="color-preview" style={{ "--_color": color || "currentColor" }} />
        </button>
      </div>
      {/* Outside the line: the line's styles (its parts' corners) mustn't reach the picker's fields. */}
      {picking && (
        <ColorPicker
          property={at.color}
          color={splitColor(color).color}
          computed={props.values?.[at.color] || props.values?.[propertiesAt("top").color] || ""}
          opacity={splitColor(color).opacity}
          onPick={(next, o, gesture) => write("color", joinColor(next, o), gesture)}
          onRevert={(gesture) => props.onRevert?.(at.color, gesture)}
          onClose={() => setPicking(false)}
          trigger={() => colorRef.current}
          {...pickerPlace(() => colorRef.current)}
        />
      )}
    </>
  );
}

export const borderEditor: PropertyEditor = {
  id: "border",
  label: "Border",
  properties: ALL_PROPERTIES,
  // Tailwind's border, border-2…, border-t…, border-dashed… classes.
  aliases: [
    "border-0",
    "border-2",
    "border-4",
    "border-8",
    "border-t",
    "border-r",
    "border-b",
    "border-l",
    "border-solid",
    "border-dashed",
    "border-dotted",
    "border-double",
    "border-none",
  ],
  component: BorderEditor,
};
