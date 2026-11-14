import { type BoxArea, type GapArea, type SideArea, areaRects, measureBoxModel } from "../../../dom/boxModel.ts";
import { flexGapRects, measureFlex } from "../../../dom/flexGaps.ts";
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
  const flex = useMeasured(element, measureFlex);
  if (!model) return null;
  const sides = areas.filter((a): a is SideArea => a.box !== "gap");
  // Gaps: both axes, or just the rows' or the columns' (row-gap, column-gap).
  const gaps = areas.filter((a): a is GapArea => a.box === "gap");
  const axes = {
    rows: gaps.some((a) => a.axis !== "column"),
    columns: gaps.some((a) => a.axis !== "row"),
  };
  const boxes = [...new Set(sides.map((a) => a.box))];
  const rects = [
    ...boxes.flatMap((box) =>
      areaRects(
        model,
        box,
        sides.filter((a) => a.box === box).map((a) => a.side),
      ).map((r) => ({ ...r, key: `${box}-${r.side}`, box, side: r.side as string | undefined })),
    ),
    // A grid's gaps from its tracks; a flex container's from where its items are.
    ...(gaps.length && !grid && flex
      ? flexGapRects(flex, axes).map((r, i) => ({ ...r, key: `gap-${i}`, box: "gap", side: undefined }))
      : []),
    ...(grid && gaps.length
      ? gapRects(grid, axes).map((r, i) => ({ ...r, key: `gap-${i}`, box: "gap", side: undefined }))
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
