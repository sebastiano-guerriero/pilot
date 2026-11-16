import type { SideArea } from "../../dom/boxModel.ts";
import type { IconName } from "../../ui/components/Icon/Icon.tsx";
import type { PropertyEditor } from "../types.ts";
import { type SplitPart, splitEditor } from "../split/SplitEditor.tsx";

export type SideName = "top" | "right" | "bottom" | "left";
const SIDES: SideName[] = ["top", "right", "bottom", "left"];

/** A four-sided property (padding, margin, inset), as a split editor of its sides. */
export interface SidesConfig {
  id: string;
  label: string;
  title: string;
  /** The shorthand: `padding`. Its sides are `padding-top`… */
  shorthand: string;
  /** Each side's property, when it isn't `<shorthand>-<side>` (inset's are `top`, `left`…). */
  sideProperty?: (side: SideName) => string;
  /**
   * The view button's icons: `<icons>-all` for one value, `<icons>-top`… for
   * each side. Defaults to the box sides (`sides-all`, `side-top`…).
   */
  icons?: "inset";
  /** The box-model area each side's field shows on the page; none when absent. */
  box?: SideArea["box"];
  /** Tailwind's aliases: all sides, each side, each axis, the logical sides (start/end). */
  aliases: { all: string; top: string; right: string; bottom: string; left: string; x: string; y: string; start: string; end: string };
}

/**
 * Padding or margin: one value for every side, or one per side (top, right,
 * bottom, left), each a part of a split editor (see SplitEditor). The search
 * lands on a side by Tailwind's alias (`pt`), its property (`padding-top`),
 * or the logical property for it (`padding-block-start`, and `ps`/`pe` for
 * inline start and end), assuming horizontal, left-to-right text as
 * declared values do. A pair (`px`, `padding-inline` → right and left; `py`,
 * `padding-block` → top and bottom) sets both sides with one typed value.
 */
export function sidesEditor(config: SidesConfig): PropertyEditor {
  const { shorthand: s, aliases: a } = config;
  const logical: Record<SideName, string[]> = {
    top: [`${s}-block-start`],
    right: [`${s}-inline-end`, a.end],
    bottom: [`${s}-block-end`],
    left: [`${s}-inline-start`, a.start],
  };
  const parts: SplitPart[] = SIDES.map((side) => ({
    key: side,
    property: config.sideProperty?.(side) ?? `${s}-${side}`,
    label: `${config.title} ${side}`,
    icon: (config.icons ? `${config.icons}-${side}` : `side-${side}`) as IconName,
    area: config.box ? { box: config.box, side } : undefined,
    aliases: [a[side], ...logical[side]],
  }));
  return splitEditor({
    id: config.id,
    label: config.label,
    title: config.title,
    shorthand: s,
    icon: config.icons ? `${config.icons}-all` : "sides-all",
    allAliases: [a.all],
    parts,
    pairs: [
      { aliases: [a.x, `${s}-inline`], parts: ["right", "left"] },
      { aliases: [a.y, `${s}-block`], parts: ["top", "bottom"] },
    ],
  });
}
