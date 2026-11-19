import { declaredOf } from "../declared.ts";
import { LengthEditor } from "../length/LengthEditor.tsx";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/** The property browsers clamp lines with (the unprefixed line-clamp isn't supported yet). */
const CLAMP = "-webkit-line-clamp";

/** What -webkit-line-clamp needs to take effect, as Tailwind's line-clamp-* writes it. */
const COMPANIONS: ReadonlyArray<[string, string]> = [
  ["display", "-webkit-box"],
  ["-webkit-box-orient", "vertical"],
  ["overflow", "hidden"],
];

/**
 * The changes for a clamp `value`, with what the element declares now:
 * the clamp, then the companions it needs (only those not already set to
 * it). Cleared (or `none`), the companions still set to the clamp's values
 * are cleared with it; others (a `display: flex` of the page's) are left.
 */
export function clampChanges(value: string, declared: (property: string) => string): Array<[string, string]> {
  const clamped = value !== "" && value !== "none";
  const changes: Array<[string, string]> = [[CLAMP, value]];
  for (const [property, needed] of COMPANIONS) {
    const now = declared(property);
    if (clamped && now !== needed) changes.push([property, needed]);
    else if (!clamped && now === needed) changes.push([property, ""]);
  }
  return changes;
}

/**
 * line-clamp: a number of lines (or none), in a field like order's, labeled
 * `line-clamp`. Writes -webkit-line-clamp with display: -webkit-box,
 * -webkit-box-orient: vertical and overflow: hidden, as one undo step, which
 * the agent reads as Tailwind's line-clamp-3 (or the project's own way).
 */
function LineClampEditor(props: PropertyEditorProps) {
  const onChange: PropertyEditorProps["onChange"] = (property, value, options) => {
    if (property !== CLAMP) return props.onChange(property, value, options);
    const gesture = options?.gesture ?? {};
    for (const [p, v] of clampChanges(value, (p) => declaredOf(props, p))) props.onChange(p, v, { gesture });
  };
  return <LengthEditor {...props} onChange={onChange} property={CLAMP} options={{ name: "line-clamp" }} />;
}

export const lineClampEditor: PropertyEditor = {
  id: "line-clamp",
  label: "Line clamp",
  properties: [CLAMP],
  reads: COMPANIONS.map(([p]) => p),
  // Tailwind's line-clamp-* (and the row's label).
  aliases: ["line-clamp"],
  component: LineClampEditor,
};
