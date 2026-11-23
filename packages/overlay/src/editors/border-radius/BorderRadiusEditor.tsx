import { splitEditor } from "../split/SplitEditor.tsx";

type Corner = "top-left" | "top-right" | "bottom-right" | "bottom-left";

/** Each corner: its property, and Tailwind's names for it (rounded-tl, and the logical rounded-ss). */
const CORNERS: Array<{ key: Corner; tailwind: string; logical: string }> = [
  { key: "top-left", tailwind: "rounded-tl", logical: "ss" },
  { key: "top-right", tailwind: "rounded-tr", logical: "se" },
  { key: "bottom-right", tailwind: "rounded-br", logical: "ee" },
  { key: "bottom-left", tailwind: "rounded-bl", logical: "es" },
];

const LOGICAL: Record<string, string> = { ss: "start-start", se: "start-end", ee: "end-end", es: "end-start" };

/**
 * border-radius, padding's way (SplitEditor): one value for every corner
 * (`border-radius`), or one per corner (top left, top right, bottom right,
 * bottom left: border-radius's own order), switched with the button at the
 * right of the row. A length or a percentage, never negative; `full` is
 * Tailwind's rounded-full. The search lands on a corner by Tailwind's name
 * (`rounded-tl`, the logical `rounded-ss`), its property, or the logical
 * property (`border-start-start-radius`), assuming left-to-right text; on a
 * pair of corners by a side (`rounded-t` → top left and top right, `-r`,
 * `-b`, `-l`, and the logical `-s`/`-e`), where a value typed sets both.
 * `rounded` and its sizes (`rounded-lg`, `rounded-full`) show the one value.
 */
export const borderRadiusEditor = splitEditor({
  id: "border-radius",
  label: "Border radius",
  title: "border-radius",
  shorthand: "border-radius",
  icon: "corners-all",
  // Every corner: Tailwind's rounded and its sizes.
  allAliases: [
    "rounded",
    "rounded-none",
    "rounded-xs",
    "rounded-sm",
    "rounded-md",
    "rounded-lg",
    "rounded-xl",
    "rounded-2xl",
    "rounded-3xl",
    "rounded-4xl",
    "rounded-full",
  ],
  parts: CORNERS.map(({ key, tailwind, logical }) => ({
    key,
    property: `border-${key}-radius`,
    label: `border-radius ${key.replace("-", " ")}`,
    icon: `corner-${key}` as const,
    aliases: [tailwind, `rounded-${logical}`, `border-${LOGICAL[logical]}-radius`],
  })),
  pairs: [
    { aliases: ["rounded-t"], parts: ["top-left", "top-right"] },
    { aliases: ["rounded-r", "rounded-e"], parts: ["top-right", "bottom-right"] },
    { aliases: ["rounded-b"], parts: ["bottom-right", "bottom-left"] },
    { aliases: ["rounded-l", "rounded-s"], parts: ["top-left", "bottom-left"] },
  ],
});
