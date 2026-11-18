// Geist and Geist Mono (variable, 100–900), bundled into Pilot as data URLs:
// no network request, no Google Fonts. Vendored from the `geist` npm package
// (v1.9.2, dist/fonts/geist-sans and geist-mono); the same license for both,
// in assets/fonts/Geist-OFL.txt.
import geistMonoVariable from "../assets/fonts/GeistMono-Variable.woff2?inline";
import geistVariable from "../assets/fonts/Geist-Variable.woff2?inline";

/**
 * Pilot's own family name, so it never collides with a "Geist" the host page
 * may load (possibly a different version or subset).
 */
export const PILOT_FONT_FAMILY = "PLT Geist";
/** The same for Geist Mono (code in the agent's replies). */
export const PILOT_MONO_FAMILY = "PLT Geist Mono";

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
  const faces = [
    new FontFace(PILOT_FONT_FAMILY, `url(${geistVariable}) format("woff2")`, { weight: "100 900", style: "normal", display: "swap" }),
    new FontFace(PILOT_MONO_FAMILY, `url(${geistMonoVariable}) format("woff2")`, { weight: "100 900", style: "normal", display: "swap" }),
  ];
  for (const face of faces) {
    document.fonts.add(face);
    // Start decoding now so the first paint of the toolbar already has it.
    face.load().catch(() => {
      // Falls back to the next family in --plt-font-main / --plt-font-mono.
    });
  }
  return () => {
    for (const face of faces) document.fonts.delete(face);
  };
}
