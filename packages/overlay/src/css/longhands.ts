/**
 * The longhands a property sets: `grid-column` → grid-column-start and
 * grid-column-end. Just the property itself when it isn't a shorthand.
 * Read from the browser (a scratch declaration of it, `initial`).
 */
const longhandCache = new Map<string, string[]>();
export function longhandsOf(property: string): string[] {
  let longhands = longhandCache.get(property);
  if (!longhands) {
    const style = document.createElement("div").style;
    style.setProperty(property, "initial");
    longhands = Array.from({ length: style.length }, (_, i) => style.item(i));
    if (longhands.length <= 1) longhands = [property];
    longhandCache.set(property, longhands);
  }
  return longhands;
}
