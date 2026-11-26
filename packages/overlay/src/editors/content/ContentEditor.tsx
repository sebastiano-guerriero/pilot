import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * content: what a ::before or ::after shows, a text field (css/values.ts
 * kind "content"): `Popular` writes `"Popular"`, `""` is the empty box a
 * decorative one needs, `none` takes it away. Shown with the before or after
 * pill; with either, the dialog adds `content: ""` to a pseudo-element's first
 * change when nothing sets one (it isn't drawn without it).
 */
export const contentEditor = lengthEditor({
  property: "content",
  label: "Content",
  aliases: ["content"],
});
