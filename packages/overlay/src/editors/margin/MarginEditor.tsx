import { boxEditor } from "../box/BoxEditor.tsx";

/** Margin: the box diagram on margin-top/right/bottom/left (negatives and `auto` allowed). */
export const marginEditor = boxEditor({
  id: "margin",
  label: "Margin",
  title: "margin",
  box: "margin",
  property: (side) => `margin-${side}`,
  aliases: { all: "m", top: "mt", right: "mr", bottom: "mb", left: "ml", x: "mx", y: "my" },
});
