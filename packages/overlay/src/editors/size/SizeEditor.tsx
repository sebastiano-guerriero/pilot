import { useLayoutEffect, useState } from "preact/hooks";
import type { InputDraft } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { heightEditor } from "../height/HeightEditor.tsx";
import { LengthEditor } from "../length/LengthEditor.tsx";
import type { FocusRequest, PropertyEditor, PropertyEditorProps } from "../types.ts";
import { widthEditor } from "../width/WidthEditor.tsx";

/** The rows: width, then height, each a length editor with a drag handle. */
const ROWS = ["width", "height"] as const;

/**
 * Tailwind's `size`: width and height, as two rows. Coming from the search
 * (Tab or Enter on `size`), it lands on width with height linked: the value
 * shows selected in both, what's typed shows in both, and Enter writes it to
 * both (one undo step), like `px` on padding. The link lasts while focus stays
 * on width. Each row is still its own property: arrows and drags change just
 * that one, and Tab goes width → height → the next editor.
 *
 * Width and height are separate editors in the search (`w`, `h`); this one
 * shows them as rows (`embeds`), so `width` doesn't find `size`.
 */
export function SizeEditor(props: PropertyEditorProps) {
  const { focusRequest, onReturnToSearch, onTabOut } = props;
  // One focus request per row: rows focus themselves when theirs changes.
  const [focus, setFocus] = useState<{ row: number; request: FocusRequest } | null>(null);
  // Width writes to height too, from the search until focus leaves width.
  const [linked, setLinked] = useState(false);
  const [draft, setDraft] = useState<InputDraft | null>(null);

  useLayoutEffect(() => {
    if (!focusRequest) return;
    const fromSearch = !focusRequest.edge;
    setLinked(fromSearch);
    setDraft(null);
    setFocus({ row: focusRequest.edge === "last" ? 1 : 0, request: { ...focusRequest } });
  }, [focusRequest]);

  const tab = (row: number, direction: 1 | -1) => {
    const next = row + direction;
    if (next >= 0 && next < ROWS.length) setFocus({ row: next, request: { query: "", edge: direction > 0 ? "first" : "last" } });
    else if (onTabOut) onTabOut(direction);
    else onReturnToSearch?.();
  };

  return (
    <div class="size-editor">
      {ROWS.map((property, row) => (
        <LengthEditor
          key={property}
          {...props}
          property={property}
          options={{ scrub: true }}
          focusRequest={focus?.row === row ? focus.request : undefined}
          onTabOut={(direction) => tab(row, direction)}
          link={
            !linked
              ? undefined
              : row === 0
                ? {
                    also: ["height"],
                    // Done typing in width (it lost focus): the link ends.
                    onDraft: (d) => {
                      setDraft(d);
                      if (!d) setLinked(false);
                    },
                  }
                : { mirror: draft ?? undefined }
          }
        />
      ))}
    </div>
  );
}

export const sizeEditor: PropertyEditor = {
  id: "size",
  label: "Size",
  // Writes width and height through its rows; listing them here would make
  // `width` and `height` find this editor too.
  properties: [],
  embeds: [widthEditor, heightEditor],
  aliases: ["size"],
  component: SizeEditor,
};
