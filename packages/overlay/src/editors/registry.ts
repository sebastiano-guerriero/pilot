import { alignContentEditor } from "./align/AlignContentEditor.tsx";
import { alignItemsEditor } from "./align/AlignItemsEditor.tsx";
import { alignSelfEditor, justifySelfEditor } from "./align/SelfEditors.tsx";
import { backgroundBlendModeEditor, mixBlendModeEditor } from "./blend/BlendEditors.tsx";
import { boxSizingEditor } from "./box-sizing/BoxSizingEditor.tsx";
import {
  appearanceEditor,
  cursorEditor,
  pointerEventsEditor,
  userSelectEditor,
  willChangeEditor,
} from "./interactivity/InteractivityEditors.tsx";
import { lineClampEditor } from "./line-clamp/LineClampEditor.tsx";
import {
  textDecorationColorEditor,
  textDecorationLineEditor,
  textDecorationStyleEditor,
  textDecorationThicknessEditor,
  textUnderlineOffsetEditor,
} from "./text-decoration/TextDecorationEditors.tsx";
import { outlineColorEditor, outlineOffsetEditor, outlineStyleEditor, outlineWidthEditor } from "./outline/OutlineEditors.tsx";
import { listStylePositionEditor, listStyleTypeEditor } from "./list-style/ListStyleEditors.tsx";
import { overscrollEditor } from "./overscroll/OverscrollEditor.tsx";
import { fillEditor, strokeEditor, strokeWidthEditor } from "./svg/SvgEditors.tsx";
import { backdropFilterEditor, filterEditor } from "./filter/FilterEditor.tsx";
import { rotateEditor } from "./rotate/RotateEditor.tsx";
import { scaleEditor, translateEditor } from "./transforms/AxesEditor.tsx";
import {
  backfaceVisibilityEditor,
  perspectiveEditor,
  perspectiveOriginEditor,
  transformOriginEditor,
  transformStyleEditor,
} from "./perspective/PerspectiveEditors.tsx";
import { boxShadowEditor } from "./box-shadow/BoxShadowEditor.tsx";
import { aspectRatioEditor } from "./aspect-ratio/AspectRatioEditor.tsx";
import { borderEditor } from "./border/BorderEditor.tsx";
import { borderRadiusEditor } from "./border-radius/BorderRadiusEditor.tsx";
import { displayEditor } from "./display/DisplayEditor.tsx";
import { floatEditor } from "./float/FloatEditor.tsx";
import { flexDirectionEditor, flexWrapEditor } from "./flex/FlexEditors.tsx";
import { flexBasisEditor, flexGrowEditor, flexShrinkEditor } from "./flex-item/FlexItemEditors.tsx";
import { gapEditor } from "./gap/GapEditor.tsx";
import { backgroundColorEditor, textColorEditor } from "./color/ColorEditor.tsx";
import {
  colEndEditor,
  colSpanEditor,
  colStartEditor,
  rowEndEditor,
  rowSpanEditor,
  rowStartEditor,
} from "./grid-column/GridColumnEditor.tsx";
import { gridColumnsEditor } from "./grid-columns/GridColumnsEditor.tsx";
import { gridRowsEditor } from "./grid-rows/GridRowsEditor.tsx";
import { heightEditor, maxHeightEditor, minHeightEditor } from "./height/HeightEditor.tsx";
import { justifyContentEditor } from "./justify/JustifyContentEditor.tsx";
import { justifyItemsEditor } from "./justify/JustifyItemsEditor.tsx";
import { marginEditor } from "./margin/MarginEditor.tsx";
import { orderEditor } from "./order/OrderEditor.tsx";
import { paddingEditor } from "./padding/PaddingEditor.tsx";
import { positionEditor } from "./position/PositionEditor.tsx";
import { insetEditor } from "./inset/InsetEditor.tsx";
import { isolationEditor } from "./isolation/IsolationEditor.tsx";
import { objectFitEditor, objectPositionEditor } from "./object-fit/ObjectFitEditor.tsx";
import { opacityEditor } from "./opacity/OpacityEditor.tsx";
import { overflowEditor } from "./overflow/OverflowEditor.tsx";
import {
  fontFamilyEditor,
  fontSizeEditor,
  fontStyleEditor,
  fontVariantNumericEditor,
  fontWeightEditor,
  letterSpacingEditor,
  lineHeightEditor,
  textAlignEditor,
  textIndentEditor,
  textOverflowEditor,
  textTransformEditor,
  textWrapEditor,
  verticalAlignEditor,
  whiteSpaceEditor,
} from "./typography/TypographyEditors.tsx";
import { visibilityEditor } from "./visibility/VisibilityEditor.tsx";
import { contentEditor } from "./content/ContentEditor.tsx";
import { maskCompositeEditor } from "./mask/MaskCompositeEditor.tsx";
import { maskImageEditor } from "./mask/MaskImageEditor.tsx";
import { zIndexEditor } from "./z-index/ZIndexEditor.tsx";
import { sizeEditor } from "./size/SizeEditor.tsx";
import { normalizeQuery } from "./query.ts";
import type { PropertyEditor } from "./types.ts";
import { maxWidthEditor, minWidthEditor, widthEditor } from "./width/WidthEditor.tsx";

/**
 * All built-in property editors. Each lives in `editors/<name>/` with its
 * component (.tsx) and styles (.css); register it here and import its CSS in
 * `ui/styles/index.css`.
 */
export const editors: PropertyEditor[] = [
  contentEditor,
  paddingEditor,
  marginEditor,
  widthEditor,
  minWidthEditor,
  maxWidthEditor,
  heightEditor,
  minHeightEditor,
  maxHeightEditor,
  sizeEditor,
  aspectRatioEditor,
  boxSizingEditor,
  displayEditor,
  floatEditor,
  gridColumnsEditor,
  gridRowsEditor,
  flexDirectionEditor,
  flexWrapEditor,
  gapEditor,
  justifyContentEditor,
  justifyItemsEditor,
  alignItemsEditor,
  alignContentEditor,
  alignSelfEditor,
  justifySelfEditor,
  colSpanEditor,
  colStartEditor,
  colEndEditor,
  rowSpanEditor,
  rowStartEditor,
  rowEndEditor,
  orderEditor,
  flexGrowEditor,
  flexShrinkEditor,
  flexBasisEditor,
  objectFitEditor,
  objectPositionEditor,
  overflowEditor,
  overscrollEditor,
  isolationEditor,
  positionEditor,
  insetEditor,
  zIndexEditor,
  backgroundColorEditor,
  borderEditor,
  borderRadiusEditor,
  opacityEditor,
  mixBlendModeEditor,
  backgroundBlendModeEditor,
  boxShadowEditor,
  filterEditor,
  backdropFilterEditor,
  translateEditor,
  rotateEditor,
  scaleEditor,
  transformOriginEditor,
  transformStyleEditor,
  backfaceVisibilityEditor,
  perspectiveEditor,
  perspectiveOriginEditor,
  visibilityEditor,
  maskImageEditor,
  maskCompositeEditor,
  fontFamilyEditor,
  fontSizeEditor,
  fontStyleEditor,
  fontWeightEditor,
  lineHeightEditor,
  letterSpacingEditor,
  textAlignEditor,
  textColorEditor,
  fontVariantNumericEditor,
  textIndentEditor,
  textWrapEditor,
  whiteSpaceEditor,
  textOverflowEditor,
  lineClampEditor,
  outlineWidthEditor,
  outlineStyleEditor,
  outlineColorEditor,
  outlineOffsetEditor,
  textDecorationLineEditor,
  textDecorationColorEditor,
  textDecorationStyleEditor,
  textDecorationThicknessEditor,
  textUnderlineOffsetEditor,
  textTransformEditor,
  verticalAlignEditor,
  listStyleTypeEditor,
  listStylePositionEditor,
  cursorEditor,
  pointerEventsEditor,
  userSelectEditor,
  appearanceEditor,
  willChangeEditor,
  fillEditor,
  strokeEditor,
  strokeWidthEditor,
];

/**
 * Rank editors for a search query, best first (hyphens and spaces ignored):
 * 4. exact alias (`pt` → padding)
 * 3. exact label or property name
 * 2. label/property starting with the query (`pad`, `padding-t`)
 * 1½. a later word of a label/property/alias starting with it (`spa` → col-span,
 *    `cols` → grid-cols), so a word being typed beats letters in the middle of one
 * 1. label/property containing it
 * Only names, properties and aliases (Tailwind's class names) are searched.
 * ½. abbreviations: the query's letters appear in order in a label/property,
 *    starting at a word start (`wdt` → width, `mxw` → max-width). Ranked last,
 *    so it only matters when nothing better matches; among several, the one
 *    skipping the fewest letters (then the shortest name) wins.
 */
export function searchEditors(query: string, list: PropertyEditor[] = editors): PropertyEditor[] {
  const q = normalizeQuery(query);
  if (!q) return list;
  return rank(q, list).map((x) => x.editor);
}

/**
 * Most editors the dialog shows at once for an abbreviation. Prefix ties
 * aren't capped: they're a family the designer is typing (`font` → all five).
 */
const MAX_SHOWN = 4;

/**
 * The editors the dialog shows for a query:
 * - every editor tied for the best match, if that match is a prefix or better
 *   (`min` → min-width and, later, min-height; a Tailwind class's first word:
 *   `content` → contents, content-center) or an equally good abbreviation
 *   (`pdg` → the four padding rows, at most MAX_SHOWN); a substring-only best match shows just
 *   the top one, so a single letter doesn't flood the dialog;
 * - plus, for each shown editor that heads a family, the family's members
 *   (`w` → width, min-width, max-width). Landing on a member directly
 *   (`min-w`) shows only that member.
 */
export function matchEditors(query: string, list: PropertyEditor[] = editors): PropertyEditor[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const ranked = rank(q, list);
  const best = ranked[0];
  if (!best) return [];
  // Ties count for prefix-or-better matches, and for abbreviations skipping
  // the same number of letters (`pdg` abbreviates every padding row alike;
  // the name-length tiebreak is ignored here).
  const tied = (x: (typeof ranked)[number]) =>
    x.score === best.score &&
    (best.score >= 1.75 || (best.score === 0.5 && Math.floor(x.penalty) === Math.floor(best.penalty)));
  const top = (best.score >= 1.75 || best.score === 0.5 ? ranked.filter(tied).map((x) => x.editor) : [best.editor])
    // Equally good matches keep the registry's order (padding: top, right, bottom, left).
    .sort((a, b) => list.indexOf(a) - list.indexOf(b));
  const shown: PropertyEditor[] = [];
  for (const editor of top) {
    for (const e of [editor, ...list.filter((m) => m.family === editor.id)]) {
      if (!shown.includes(e)) shown.push(e);
    }
  }
  return best.score >= 1.75 ? shown : shown.slice(0, MAX_SHOWN);
}

function rank(q: string, list: PropertyEditor[]): Array<{ editor: PropertyEditor; score: number; penalty: number }> {
  // `q` is already normalized; compare against normalized names too.
  const score = (e: PropertyEditor): number => {
    if (e.aliases?.some((a) => normalizeQuery(a) === q)) return 4;
    const names = [e.label, ...e.properties].map(normalizeQuery);
    if (names.some((n) => n === q)) return 3;
    if (names.some((n) => n.startsWith(q))) return 2;
    // A part of the shorthand typed (rotate in `transform`): beside the properties named for it, not above them.
    if (e.partOf && normalizeQuery(e.partOf).startsWith(q)) return 2;
    // A Tailwind class that starts with it, by whole words, or the first
    // word's start (`items` → items-center: align-items, not justify-items,
    // whose name only has the word later; `hue-rotate` → hue-rotate-90).
    // Not into a later word: `cols` isn't col-start.
    if (e.aliases?.some((a) => startsByWords(a, q))) return 1.75;
    const laterWords = [e.label, ...e.properties, ...(e.aliases ?? [])].flatMap((n) => n.toLowerCase().split(/[\s-]+/).slice(1));
    if (laterWords.some((w) => w.startsWith(q))) return 1.5;
    if (names.some((n) => n.includes(q))) return 1;
    return 0;
  };
  const abbreviation = (e: PropertyEditor): number | null => {
    const penalties = [e.label, ...e.properties]
      .map((name) => {
        const skipped = abbreviationPenalty(q, name);
        return skipped === null ? null : skipped + name.length * 0.01; // shorter names win ties
      })
      .filter((p): p is number => p !== null);
    return penalties.length ? Math.min(...penalties) : null;
  };
  return list
    .map((editor) => {
      const s = score(editor);
      if (s > 0) return { editor, score: s, penalty: 0 };
      const p = abbreviation(editor);
      return { editor, score: p === null ? 0 : 0.5, penalty: p ?? 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.penalty - b.penalty);
}

const SEPARATOR = /[\s-]/;

/** Whether `alias` starts with the normalized query `q`: within its first word, or as whole words. */
function startsByWords(alias: string, q: string): boolean {
  const words = alias.toLowerCase().split(/[\s-]+/);
  if (words[0]?.startsWith(q)) return true;
  let joined = "";
  for (const word of words) {
    joined += word;
    if (joined === q) return true;
    if (joined.length >= q.length) return false;
  }
  return false;
}

/**
 * How many letters of `name` are skipped to find the query's letters in order,
 * starting at a word start (the beginning, or after a hyphen/space), plus 1
 * when that start isn't the name's first word. Null when the query isn't an
 * abbreviation of `name`. `wdt` in "width" skips 1 (the i).
 */
export function abbreviationPenalty(q: string, name: string): number | null {
  const n = name.toLowerCase();
  let best: number | null = null;
  for (let start = 0; start < n.length; start++) {
    const wordStart = start === 0 || SEPARATOR.test(n[start - 1] as string);
    if (!wordStart || n[start] !== q[0]) continue;
    let matched = 1;
    let skipped = 0;
    for (let j = start + 1; j < n.length && matched < q.length; j++) {
      const ch = n[j] as string;
      if (SEPARATOR.test(ch)) continue;
      if (ch === q[matched]) matched++;
      else skipped++;
    }
    // Starting at a later word ("width" in min-width) is a weaker abbreviation
    // than starting at the name itself: one extra step, so `wdt` prefers width.
    const penalty = skipped + (start > 0 ? 1 : 0);
    if (matched === q.length && (best === null || penalty < best)) best = penalty;
  }
  return best;
}
