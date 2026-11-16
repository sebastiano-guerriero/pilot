import { lengthEditor } from "../length/LengthEditor.tsx";
import { presetEditor } from "../preset/PresetEditor.tsx";

/**
 * A flex item's share of its container's space. Grow and shrink are selects
 * with the two values almost every layout uses, 0 and 1, and `custom` for any
 * other number (no unit, decimals too: `0.5`, never negative; see
 * PresetEditor). Basis is a field with a drag handle: a length or a size
 * keyword (`auto`, `content`…).
 */

/** flex-grow: how much of the free space the item takes (0: none, 1: its share). */
export const flexGrowEditor = presetEditor({
  property: "flex-grow",
  label: "Flex grow",
  presets: ["0", "1"],
  customLabel: "custom flex-grow",
  // Tailwind's grow / grow-0 utilities.
  aliases: ["grow"],
});

/** flex-shrink: how much the item gives up when space runs short (0: never). */
export const flexShrinkEditor = presetEditor({
  property: "flex-shrink",
  label: "Flex shrink",
  presets: ["0", "1"],
  customLabel: "custom flex-shrink",
  // Tailwind's shrink / shrink-0 utilities.
  aliases: ["shrink"],
});

/** flex-basis: the item's starting size along the main axis, before growing or shrinking. */
export const flexBasisEditor = lengthEditor({
  property: "flex-basis",
  label: "Flex basis",
  // Tailwind's basis-* utilities.
  aliases: ["basis"],
  scrub: true,
});
