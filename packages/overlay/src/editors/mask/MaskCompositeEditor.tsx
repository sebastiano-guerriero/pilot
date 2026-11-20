import { MASK_COMPOSITE_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * mask-composite, as a select, labeled `composite` (the full name doesn't
 * fit the row's label; it sits under mask-image): how the element's mask layers combine. `add`
 * (CSS's default) keeps what any layer keeps; `intersect` only what every
 * layer keeps, which is what stacked fades mean (and what Tailwind's mask
 * utilities set). The mask-image editor will write `intersect` with its
 * linear and radial masks, as line-clamp writes its companions.
 */
export const maskCompositeEditor = keywordEditor({
  property: "mask-composite",
  name: "composite",
  label: "Mask composite",
  options: MASK_COMPOSITE_VALUES,
  // Tailwind's mask-add, mask-subtract, mask-intersect, mask-exclude (and the row's label).
  aliases: ["composite", "mask-add", "mask-subtract", "mask-intersect", "mask-exclude"],
});
