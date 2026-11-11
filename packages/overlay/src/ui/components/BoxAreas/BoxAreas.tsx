import { useLayoutEffect, useState } from "preact/hooks";
import { type BoxArea, type BoxModel, areaRects, measureBoxModel } from "../../../dom/boxModel.ts";
import { px } from "../../px.ts";

interface BoxAreasProps {
  element: Element;
  /** What to show; drawn instead of the selection highlight while set. */
  areas: BoxArea[];
}

/**
 * Shows parts of the selected element's box model (padding, border, margin),
 * e.g. the padding sides an
 * editor is about to change. Re-measured every frame, so the areas follow the
 * values live while dragging. Purely visual: never receives events.
 */
export function BoxAreas({ element, areas }: BoxAreasProps) {
  const model = useBoxModel(element);
  if (!model) return null;
  const boxes = [...new Set(areas.map((a) => a.box))];
  return (
    <div class="box-areas" aria-hidden="true">
      {boxes.flatMap((box) =>
        areaRects(
          model,
          box,
          areas.filter((a) => a.box === box).map((a) => a.side),
        ).map((r) => (
          <div
            key={`${box}-${r.side}`}
            class="area"
            data-box={box}
            data-side={r.side}
            style={{ left: px(r.left), top: px(r.top), width: px(r.width), height: px(r.height) }}
          />
        )),
      )}
    </div>
  );
}

/** The element's box model, re-measured every frame; re-renders only when it changes. */
function useBoxModel(element: Element): BoxModel | null {
  const [model, setModel] = useState(() => measureBoxModel(element));
  useLayoutEffect(() => {
    let frame = 0;
    let last = "";
    const tick = () => {
      const next = measureBoxModel(element);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setModel(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [element]);
  return model;
}
