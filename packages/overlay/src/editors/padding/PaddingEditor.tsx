import { boxEditor } from "../box/BoxEditor.tsx";

/** Padding: the box diagram on padding-top/right/bottom/left. Tailwind aliases. */
export const paddingEditor = boxEditor({
  id: "padding",
  label: "Padding",
  title: "padding",
  box: "padding",
  property: (side) => `padding-${side}`,
  aliases: { all: "p", top: "pt", right: "pr", bottom: "pb", left: "pl", x: "px", y: "py" },
  keywords: ["spacing", "inset", "inner space"],
});
