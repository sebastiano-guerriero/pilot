import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/**
 * Padding editor. Static structure first (designed by hand); reading the
 * current values from `values` and writing changes through `onChange` gets
 * wired in afterwards.
 */
export function PaddingEditor(_props: PropertyEditorProps) {
  return (
    <div class="padding-editor">
      <div class="wrapper">
        <div class="label"></div>
      </div>
    </div>
  );
}

export const paddingEditor: PropertyEditor = {
  id: "padding",
  label: "Padding",
  properties: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  keywords: ["spacing", "inset", "inner space"],
  component: PaddingEditor,
};
