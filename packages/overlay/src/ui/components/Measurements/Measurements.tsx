import { type Box, measure } from "../../../dom/measure.ts";
import { px } from "../../px.ts";

interface MeasurementsProps {
  /** The selection's box (viewport px). */
  from: Box;
  /** The box measured to: the hovered element's, or the selection's parent's. */
  to: Box;
}

/** A value as shown: whole pixels bare, fractions to a tenth. */
const shown = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/**
 * Figma's redlines, while Alt is held (App): the two boxes outlined in red,
 * a red line for each distance between them (dom/measure.ts) with its value
 * in a red pill at its middle, and dashed guides where a line ends off the
 * other box. Purely visual: never receives events.
 */
export function Measurements({ from, to }: MeasurementsProps) {
  const { distances, guides } = measure(from, to);
  const outline = (b: Box) => ({ left: px(b.left), top: px(b.top), width: px(b.right - b.left), height: px(b.bottom - b.top) });
  return (
    <div class="measurements" aria-hidden="true">
      <div class="box" style={outline(to)} />
      <div class="box" style={outline(from)} />
      {guides.map((g) => (
        <div
          key={`g-${g.axis}-${g.at}-${g.from}`}
          class="guide"
          data-axis={g.axis}
          style={
            g.axis === "x"
              ? { left: px(g.from), top: px(g.at), width: px(g.to - g.from) }
              : { left: px(g.at), top: px(g.from), height: px(g.to - g.from) }
          }
        />
      ))}
      {distances.map((d) => (
        <div
          key={`d-${d.axis}-${d.from}-${d.to}`}
          class="line"
          data-axis={d.axis}
          style={
            d.axis === "x"
              ? { left: px(d.from), top: px(d.at), width: px(d.to - d.from) }
              : { left: px(d.at), top: px(d.from), height: px(d.to - d.from) }
          }
        >
          <span class="value">{shown(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
