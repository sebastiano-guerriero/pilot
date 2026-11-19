import { declaredOf } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import { TracksRow } from "./TracksRow.tsx";

/**
 * grid-columns (`grid-template-columns`): a mode select plus a field, see
 * TracksRow. Found on its own (`cols`, `grid-cols`), and shown by display
 * as one of its grid rows.
 */
function GridColumnsEditor(props: PropertyEditorProps) {
  const { onChange, focusRequest, onReturnToSearch, onTabOut } = props;
  return (
    <TracksRow
      axis="columns"
      value={declaredOf(props, "grid-template-columns")}
      focusRequest={focusRequest}
      onChange={(value) => onChange("grid-template-columns", value)}
      onSubmit={onReturnToSearch}
      onTab={(direction) => (onTabOut ? onTabOut(direction) : onReturnToSearch?.())}
    />
  );
}

export const gridColumnsEditor: PropertyEditor = {
  id: "grid-columns",
  label: "Grid columns",
  properties: ["grid-template-columns"],
  // Tailwind's grid-cols-* utilities, and the row's label.
  aliases: ["grid-cols", "grid-columns"],
  component: GridColumnsEditor,
};
