import { OVERSCROLL_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * overscroll-behavior, as a select, labeled `overscroll` (the full name
 * doesn't fit the row's label): whether scrolling past the element's end
 * scrolls the page behind it (auto) or stops there (contain, none).
 */
export const overscrollEditor = keywordEditor({
  property: "overscroll-behavior",
  name: "overscroll",
  label: "Overscroll behavior",
  options: OVERSCROLL_VALUES,
  // Tailwind's overscroll-auto / -contain / -none (and the row's label).
  aliases: ["overscroll", "overscroll-auto", "overscroll-contain", "overscroll-none"],
});
