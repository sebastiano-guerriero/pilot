import { ISOLATION_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * isolation, as a select: `isolate` starts a new stacking context, so the
 * element's children's z-index and blending stay inside it.
 */
export const isolationEditor = keywordEditor({
  property: "isolation",
  label: "Isolation",
  options: ISOLATION_VALUES,
  // Tailwind's isolate / isolation-auto.
  aliases: ["isolate", "isolation-auto"],
});
