import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/**
 * Width editor. Static structure first (designed by hand); reading the current
 * value from `values.width` and writing changes through `onChange` (plus
 * `focusRequest`, `onReturnToSearch`, `onHint`, `onInspect` for the keyboard
 * loop and the page overlay) gets wired in afterwards.
 */
export function WidthEditor(_props: PropertyEditorProps) {
  return (
    <div class="width-editor">
      <p class='label'>Width</p>
      <div class='form-control'>100%</div>
    </div>
  );
}

export const widthEditor: PropertyEditor = {
  id: "width",
  label: "Width",
  properties: ["width"],
  aliases: ["w"],
  keywords: ["size", "horizontal"],
  component: WidthEditor,
};
