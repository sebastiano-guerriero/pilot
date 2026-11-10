// Geist Mono (variable, 100–900), bundled into Pilot as a data URL: no
// network request, no Google Fonts. Vendored from the `geist` npm package
// (v1.9.2); license in assets/fonts/GeistMono-OFL.txt.
import geistMonoVariable from "../assets/fonts/GeistMono-Variable.woff2?inline";

/**
 * Pilot's own family name, so it never collides with a "Geist Mono" the host
 * page may load (possibly a different version or subset).
 */
export const PILOT_FONT_FAMILY = "PLT Geist Mono";

/**
 * Register Pilot's fonts with the document.
 *
 * Why the FontFace API instead of @font-face in tokens.css: browsers don't
 * reliably apply @font-face rules declared inside a Shadow DOM (Chrome ignores
 * them), and this avoids adding a <style> to the host page. Faces added to
 * `document.fonts` are usable from inside Pilot's shadow tree.
 *
 * Returns a cleanup that removes the faces again.
 */
export function registerFonts(): () => void {
  if (typeof FontFace === "undefined" || !document.fonts) return () => {};
  const face = new FontFace(PILOT_FONT_FAMILY, `url(${geistMonoVariable}) format("woff2")`, {
    weight: "100 900",
    style: "normal",
    display: "swap",
  });
  document.fonts.add(face);
  // Start decoding now so the first paint of the toolbar already has it.
  face.load().catch(() => {
    // Falls back to the next family in --plt-font-main.
  });
  return () => document.fonts.delete(face);
}
