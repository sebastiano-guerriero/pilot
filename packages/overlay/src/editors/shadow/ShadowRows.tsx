import { parseValue } from "../../css/values.ts";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { tokensFor } from "../../ui/components/TokenMenu/tokens.ts";
import { colorEditor } from "../color/ColorEditor.tsx";
import { useScrub } from "../length/useScrub.ts";
import { stepField } from "../step.ts";
import type { PropertyEditorProps } from "../types.ts";

/** A shadow's length row: its name (x, y, blur, spread), and the property whose kind its value is (parse, steps, drag). */
export interface ShadowLength {
  part: string;
  kind: string;
}

/** Offsets and spread can be negative (text-indent's kind); the blur can't (stroke-width's). */
export const OFFSET = "text-indent";
export const BLUR = "stroke-width";

/** The color row: the dialog's color editor (swatch, opacity, tokens), on the shadow's color instead of a property. */
const shadowColorEditor = colorEditor({ property: "color", name: "color", label: "Shadow color" });

interface ShadowRowsProps {
  element: PropertyEditorProps["element"];
  /** The length rows, in order. */
  lengths: readonly ShadowLength[];
  /** Each part's value by name, the color's under `color`; "" for not set. */
  values: Record<string, string>;
  /** A part changed (`color` for the color), as one undo step per `gesture`. */
  onChange(part: string, value: string, gesture?: object): void;
  /** A drag back where it started: the earlier value, not a fake edit. */
  onRevert(gesture: object): void;
}

/**
 * A shadow's parts, a row each (filter's drop-shadow, box-shadow): lengths
 * with steps, the wheel and a drag handle (`0` when empty), then the color,
 * in the dialog's color editor.
 */
export function ShadowRows({ element, lengths, values, onChange, onRevert }: ShadowRowsProps) {
  // The lengths drag like any length (useScrub), into the shadow.
  const scrub = useScrub({
    onChange: (part, next, options) => onChange(part, next, options?.gesture),
    onRevert: (_part, gesture) => onRevert(gesture),
  });
  return (
    <>
      {lengths.map(({ part, kind }) => (
        <PropertyRow key={part} label={part}>
          <PropertyInputText
            value={values[part] ?? ""}
            label={`shadow ${part}`}
            placeholder="0"
            tokens={tokensFor(kind)}
            onCommit={(text) => {
              const next = text.trim() ? parseValue(kind, text) : "";
              if (next !== null && next !== (values[part] ?? "")) onChange(part, next);
            }}
            onStep={(delta, text, gesture) => {
              const next = stepField(kind, text || "0px", delta, "0px");
              if (next) onChange(part, next, gesture);
            }}
            onScrub={(steps, startText, gesture) => scrub({ property: kind, writes: part, base: () => "0px" }, steps, startText || "0px", gesture)}
          />
        </PropertyRow>
      ))}
      <shadowColorEditor.component
        element={element}
        values={{ color: values.color ?? "" }}
        declared={{ color: values.color ?? "" }}
        onChange={(_property, next, options) => onChange("color", next, options?.gesture)}
        onRevert={(_property, gesture) => onRevert(gesture)}
      />
    </>
  );
}
