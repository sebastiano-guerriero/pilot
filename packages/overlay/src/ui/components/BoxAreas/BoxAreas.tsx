import { type BoxArea, type SideArea, areaRects, measureBoxModel } from "../../../dom/boxModel.ts";
import { gapRects, measureGrid } from "../../../dom/gridLines.ts";
import { px } from "../../px.ts";
import { useMeasured } from "../../useMeasured.ts";

interface BoxAreasProps {
  element: Element;
  /** What to show; drawn instead of the selection highlight while set. */
  areas: BoxArea[];
}

/**
 * Shows parts of the selected element, striped: box-model sides (padding,
 * border, margin), e.g. the padding sides an editor is about to change, or a
 * grid container's gaps. Re-measured every frame, so the areas follow the
 * values live while dragging or typing. Purely visual: never receives events.
 */
export function BoxAreas({ element, areas }: BoxAreasProps) {
  const model = useMeasured(element, measureBoxModel);
  const grid = useMeasured(element, measureGrid);
  if (!model) return null;
  const sides = areas.filter((a): a is SideArea => a.box !== "gap");
  const boxes = [...new Set(sides.map((a) => a.box))];
  const rects = [
    ...boxes.flatMap((box) =>
      areaRects(
        model,
        box,
        sides.filter((a) => a.box === box).map((a) => a.side),
      ).map((r) => ({ ...r, key: `${box}-${r.side}`, box, side: r.side as string | undefined })),
    ),
    ...(grid && areas.some((a) => a.box === "gap")
      ? gapRects(grid).map((r, i) => ({ ...r, key: `gap-${i}`, box: "gap", side: undefined }))
      : []),
  ];
  return (
    <div class="box-areas" aria-hidden="true">
      {rects.map((r) => (
        <div
          key={r.key}
          class="area"
          data-box={r.box}
          data-side={r.side}
          style={{ left: px(r.left), top: px(r.top), width: px(r.width), height: px(r.height) }}
        />
      ))}
    </div>
  );
}
