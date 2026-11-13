import { boxEditor } from "../box/BoxEditor.tsx";

/**
 * Border width: the box diagram on border-top/right/bottom/left-width.
 * A width shows nothing while the side's border-style is `none` (the default),
 * so setting one also sets that side's style to solid, in the same undo step.
 */
export const borderEditor = boxEditor({
  id: "border",
  label: "Border",
  title: "border",
  box: "border",
  property: (side) => `border-${side}-width`,
  aliases: { all: "border", top: "border-t", right: "border-r", bottom: "border-b", left: "border-l", x: "border-x", y: "border-y" },
  requires: { property: (side) => `border-${side}-style`, missing: "none", value: "solid" },
});
