import { declaredOf } from "../declared.ts";
import { TracksRow } from "../grid-columns/TracksRow.tsx";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/**
 * grid-rows (`grid-template-rows`): grid-columns' row (TracksRow) for the
 * other axis. Found on its own (`grid-rows`), and shown by display as one of
 * its grid rows.
 */
function GridRowsEditor(props: PropertyEditorProps) {
  const { onChange, focusRequest, onReturnToSearch, onTabOut } = props;
  return (
    <TracksRow
      axis="rows"
      value={declaredOf(props, "grid-template-rows")}
      focusRequest={focusRequest}
      onChange={(value) => onChange("grid-template-rows", value)}
      onSubmit={onReturnToSearch}
      onTab={(direction) => (onTabOut ? onTabOut(direction) : onReturnToSearch?.())}
    />
  );
}

export const gridRowsEditor: PropertyEditor = {
  id: "grid-rows",
  label: "Grid rows",
  properties: ["grid-template-rows"],
  // Tailwind's grid-rows-* utilities, which are also the row's label.
  aliases: ["grid-rows"],
  component: GridRowsEditor,
};
