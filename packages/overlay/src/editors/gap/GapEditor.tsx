import { splitEditor } from "../split/SplitEditor.tsx";

/**
 * gap: one value for both gaps (`gap`), or split into the gap between rows
 * (`row-gap`) and the gap between columns (`column-gap`), switched with the
 * button at the right of the row, like padding (see SplitEditor). Each field
 * has a drag handle. Typing a part in the search splits right away, and Tab
 * lands on it: `gap-y` or `row-gap` on the row gap, `gap-x` or `column-gap`
 * on the column gap (Tailwind's gap-x is column-gap). `gap` lands on the one
 * value, as Tailwind's gap-* sets both (when they differ, it reads "Mixed").
 * While a field is hovered or focused, a grid's gaps are striped on the page:
 * both, or just that part's. Found on its own, and shown by display as one of
 * its grid rows.
 */
export const gapEditor = splitEditor({
  id: "gap",
  label: "Gap",
  title: "gap",
  shorthand: "gap",
  icon: "gap-all",
  // Tailwind's gap-* sets both: `gap` lands on the one value, like `p`.
  allAliases: ["gap"],
  parts: [
    {
      key: "row",
      property: "row-gap",
      label: "row-gap",
      icon: "gap-row",
      area: { box: "gap", axis: "row" },
      aliases: ["gap-y"],
    },
    {
      key: "column",
      property: "column-gap",
      label: "column-gap",
      icon: "gap-column",
      area: { box: "gap", axis: "column" },
      aliases: ["gap-x"],
    },
  ],
});
