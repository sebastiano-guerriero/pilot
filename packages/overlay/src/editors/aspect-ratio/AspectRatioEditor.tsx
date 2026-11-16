import { type PresetConfig, presetEditor, presetOption } from "../preset/PresetEditor.tsx";

/**
 * The ratios the select offers, as CSS writes them: auto, then the common
 * landscape ratios (square first), then their portrait versions.
 */
export const RATIOS = ["auto", "1 / 1", "4 / 3", "3 / 2", "16 / 9", "21 / 9", "3 / 4", "2 / 3", "9 / 16"] as const;

/**
 * aspect-ratio: a select with the common ratios, and `custom`, which adds a
 * field for any other ratio (placeholder `x/y`; `4/5`, `4 / 5` and `4:5` all
 * write `4 / 5`, see the ratio kind in css/values.ts). See PresetEditor.
 */
const config: PresetConfig = {
  property: "aspect-ratio",
  label: "Aspect ratio",
  presets: RATIOS,
  placeholder: "x/y",
  customLabel: "custom aspect ratio",
  // Tailwind's aspect-* utilities.
  aliases: ["aspect-auto", "aspect-square", "aspect-video"],
};

export const aspectRatioEditor = presetEditor(config);

/** What the select shows for a value: "" (none), a listed ratio, or custom. */
export function ratioOption(value: string): string {
  return presetOption(config, value);
}
