import { anchorAt } from "../../../dom/anchor.ts";
import { type BoxArea, type GapArea, type SideArea, areaRects, measureBoxModel } from "../../../dom/boxModel.ts";
import { flexGapRects, measureFlex } from "../../../dom/flexGaps.ts";
import { gapRects, measureGrid } from "../../../dom/gridLines.ts";
import { px } from "../../px.ts";
import { useMeasured } from "../../useMeasured.ts";
import { PageAnchor } from "../PageAnchor/PageAnchor.tsx";

interface BoxAreasProps {
  element: Element;
  /** What to show; drawn instead of the selection highlight while set. */
  areas: BoxArea[];
}

/**
 * Shows parts of an element, striped: box-model sides (padding, border,
 * margin), e.g. the padding sides an editor is about to change, or a grid
 * container's gaps. Re-measured every frame, so the areas follow the values
 * live while dragging or typing. Purely visual: never receives events.
 */
export function BoxAreas({ element, areas }: BoxAreasProps) {
  // Measured together, with the scroll then: drawn in the page (PageAnchor).
  const { model, grid, flex, at } = useMeasured(element, measureAll);
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
    <PageAnchor at={at}>
      <div class="box-areas" aria-hidden="true">
        {rects.map((r) => (
          <div
            key={r.key}
            class="area"
            data-box={r.box}
            data-side={r.side}
            // The pattern starts at the anchor's corner (`--_x`, `--_y`: BoxAreas.css).
            style={{
              left: px(r.left),
              top: px(r.top),
              width: px(r.width),
              height: px(r.height),
              "--_x": px(-r.left),
              "--_y": px(-r.top),
            }}
          />
        ))}
      </div>
    </PageAnchor>
  );
}

function measureAll(element: Element) {
  const model = measureBoxModel(element);
  // Down to the margin's bottom, the lowest area drawn.
  const at = model
    ? anchorAt(element, { bottom: model.rect.top + model.rect.height + Math.max(0, model.margin.bottom) }, 0)
    : null;
  return { model, grid: measureGrid(element), flex: measureFlex(element), at };
}
