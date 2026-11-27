import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { LayerList } from "../../ui/components/LayerList/LayerList.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { Icon } from "../../ui/components/Icon/Icon.tsx";
import { Tooltip } from "../../ui/components/Tooltip/Tooltip.tsx";
import { declaredOf, isMixed } from "../declared.ts";
import { parseAxis as parseAngle, stepAngle, AXES as ROTATE_AXES, axisVar as rotateVar } from "../rotate/rotate.ts";
import { rotateEditor } from "../rotate/RotateEditor.tsx";
import { AXES, axisVar } from "../transforms/axes.ts";
import { scaleEditor, translateEditor } from "../transforms/AxesEditor.tsx";
import { normalizeQuery } from "../query.ts";
import type { FocusRequest, PropertyEditor, PropertyEditorProps } from "../types.ts";
import { joinTransform, parseTransformText, skewOf, splitTransform } from "./transform.ts";

const PROPERTY = "transform";
/** The panel's select (the owner's design, 2026-11-27): each transformation on its own, CSS as typed, or none. */
const MODES = ["default", "custom", "none"] as const;
type Mode = (typeof MODES)[number];
/** The transformations that are properties of their own, shown as rows in default. */
const OWN = ["translate", "rotate", "scale"] as const;

const HINTS: Record<Mode, string> = {
  "default": "Each on its own: translate, rotate and scale apply in that order, then skew.",
  custom: "Transform functions as CSS, applied in the order written: translate(3px) rotate(5deg) skewX(10deg).",
  none: "No transformation: translate, rotate, scale and transform are all none.",
};

/** What custom and none take, dimmed after them in the select (as box-shadow's). */
const TAKES: Partial<Record<Mode, string>> = { custom: "CSS", none: "no transform" };

/** A type's icon, on the chip and in the select: the owner's for default and custom; none, the usual box with the red line. */
function typeIcon(mode: Mode) {
  return <Icon name={mode === "none" ? "mask-none" : `transform-${mode}`} />;
}

/**
 * Transform (the owner's design, 2026-11-27): one row for every way an
 * element is transformed, so the designer needn't know CSS has four
 * properties. The row's one chip says what's set (what's translated, rotated,
 * scaled, skewed; custom; or none), × takes it all off; the chip or + opens
 * one panel:
 * - its type select first: default (rows for translate, rotate and scale, their own
 *   editors, and skew's X and Y), custom (one field: everything as CSS
 *   functions, in transform), or none (all four none, one step);
 * - which one shows comes from the CSS: none when all four are none, custom
 *   when transform holds anything but skew, default otherwise.
 * Pilot writes the properties behind it: translate, rotate and scale their
 * own (so Tailwind v4's classes and a hover on one of them stay as the
 * project writes them), skew in transform. Rotate's split view adds its
 * rotations to transform: they're never shown, and kept.
 */
function TransformEditor(props: PropertyEditorProps) {
  const { onChange } = props;
  const value = (p: string) => declaredOf(props, p);
  const transform = value(PROPERTY);
  const { shown, pilot } = splitTransform(transform);
  const skew = skewOf(shown);
  const set = (p: (typeof OWN)[number]) => {
    const v = value(p);
    const vars = p === "rotate" ? ROTATE_AXES.map((a) => value(rotateVar(a))) : AXES.map((a) => value(axisVar(p, a)));
    return (!!v && v !== "none") || vars.some(Boolean) || (p === "rotate" && pilot.length > 0);
  };
  const allNone = shown === "none" && OWN.every((p) => !value(p) || value(p) === "none");
  const read: Mode = allNone ? "none" : shown && shown !== "none" && !skew ? "custom" : "default";

  // A mode picked before anything's written for it (custom, before its text is typed): kept until the value changes.
  const [picked, setPicked] = useState<Mode | null>(null);
  useEffect(() => setPicked(null), [transform]);
  const mode = picked ?? read;
  const [open, setOpen] = useState<number | null>(null);

  // Writes, each one undo step.
  const clearOwn = (p: (typeof OWN)[number], gesture: object) => {
    if (value(p)) onChange(p, "", { gesture });
    const vars = p === "rotate" ? ROTATE_AXES.map((a) => rotateVar(a)) : AXES.map((a) => axisVar(p, a));
    for (const v of vars) if (value(v)) onChange(v, "", { gesture });
  };
  const toNone = () => {
    const gesture = {};
    for (const p of OWN) {
      for (const v of p === "rotate" ? ROTATE_AXES.map((a) => rotateVar(a)) : AXES.map((a) => axisVar(p, a))) if (value(v)) onChange(v, "", { gesture });
      onChange(p, "none", { gesture });
    }
    onChange(PROPERTY, "none", { gesture });
  };
  const fromNone = () => {
    const gesture = {};
    for (const p of [...OWN, PROPERTY]) if (value(p) === "none") onChange(p, "", { gesture });
  };
  const writeTransform = (text: string, gesture: object = {}) => {
    const next = joinTransform(text, pilot);
    if (next !== transform) onChange(PROPERTY, next, { gesture });
  };
  const pick = (next: Mode) => {
    if (next === mode) return;
    setPicked(null);
    if (next === "none") return toNone();
    if (mode === "none") fromNone();
    // Back to default from custom: the skews stay, the rest of the text goes.
    if (next === "default" && mode === "custom") return writeTransform(skew ? formatSkew(skew) : "");
    // To custom: the field starts with everything set, translate, rotate and scale as functions too
    // (`translate(3px) skewX(10deg)`); written, it's all transform, and they go (one step): what applies is what it shows.
    if (next === "custom") {
      setDraft(foldedText());
      setPicked("custom");
    }
  };
  // The text custom starts with when picked (null: transform's own, as read).
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [transform]);
  function foldedText(): string {
    const parts: string[] = [];
    // translate: its axes (Pilot's split view), or its value: 1 to 3 parts.
    const tAxes = AXES.map((a) => value(axisVar("translate", a)));
    const t = tAxes.some(Boolean) ? tAxes.map((x) => x || "0px") : splitParts(value("translate"));
    if (t.length) parts.push(t.length === 3 && t[2] !== "0px" ? `translate3d(${t.join(", ")})` : `translate(${t.slice(0, 2).join(", ")})`);
    // rotate: its axes (rotateX…), or its value: an angle, an axis and an angle, or a vector and an angle.
    const rAxes = ROTATE_AXES.map((a) => [a, value(rotateVar(a))] as const).filter(([, x]) => x);
    if (rAxes.length) for (const [a, x] of rAxes) parts.push(`rotate${a.toUpperCase()}(${x})`);
    else {
      const r = splitParts(value("rotate"));
      if (r.length === 1) parts.push(`rotate(${r[0]})`);
      else if (r.length === 2) parts.push(`rotate${(r[0] as string).toUpperCase()}(${r[1]})`);
      else if (r.length === 4) parts.push(`rotate3d(${r.join(", ")})`);
    }
    // scale: its axes, or its value: 1 to 3 parts.
    const sAxes = AXES.map((a) => value(axisVar("scale", a)));
    const sc = sAxes.some(Boolean) ? sAxes.slice(0, 2).map((x) => x || "1") : splitParts(value("scale"));
    if (sc.length) parts.push(sc.length === 3 ? `scale3d(${sc.join(", ")})` : `scale(${sc.join(", ")})`);
    if (shown && shown !== "none") parts.push(shown);
    return parts.join(" ");
  }
  /** Custom's text written: transform, and (from a folded start) translate, rotate and scale gone, one step. */
  const writeCustom = (text: string) => {
    const gesture = {};
    if (draft !== null) {
      for (const p of OWN) clearOwn(p, gesture);
      const next = text;
      if (next !== transform) onChange(PROPERTY, next, { gesture });
      return;
    }
    writeTransform(text, gesture);
  };

  // The row's one chip (the owner's call, 2026-11-27: one transform, not a chip per property): none, custom with its
  // functions, or what's set, with its value when it's one (`rotate 10deg`), else their names, the CSS on hover.
  // × takes it all off, one step.
  const chips: Array<{ name: string; hint?: string; tooltip?: string; swatch?: ComponentChildren; remove(): void }> = [];
  // The type's icon before it, as in the select.
  if (allNone) chips.push({ name: "none", swatch: typeIcon("none"), remove: fromNone });
  else if (read === "custom") chips.push({ name: "custom", hint: foldedText(), swatch: typeIcon("custom"), remove: removeAll });
  else {
    const names: string[] = OWN.filter(set);
    if (skew) names.push("skew");
    const only = names.length === 1 ? (names[0] as string) : null;
    if (only) chips.push({ name: only, hint: only === "skew" ? skewSummary() : summary(only as (typeof OWN)[number]), swatch: typeIcon("default"), remove: removeAll });
    else if (names.length) chips.push({ name: names.join(", "), tooltip: foldedText(), swatch: typeIcon("default"), remove: removeAll });
  }
  function skewSummary(): string {
    return skew ? [skew.x && `x ${skew.x}`, skew.y && `y ${skew.y}`].filter(Boolean).join(" ") : "";
  }
  function removeAll() {
    const gesture = {};
    for (const p of OWN) clearOwn(p, gesture);
    if (transform) onChange(PROPERTY, "", { gesture });
  }
  function summary(p: (typeof OWN)[number]): string {
    const v = value(p);
    const axes = p === "rotate" ? ROTATE_AXES.map((a) => [a, value(rotateVar(a))]) : AXES.map((a) => [a, value(axisVar(p, a))]);
    const parts = axes.filter(([, x]) => x).map(([a, x]) => `${a} ${x}`);
    return parts.length ? parts.join(" ") : v.includes("var(--pilot-") ? "" : v;
  }
  // Searched by one of its rows (`rotate`, `translate-y`, `skew`) and entered: the panel opens on that row, which
  // takes the focus (translate's Y for `translate-y`). Otherwise the row's first chip does (LayerList).
  const [landed, setLanded] = useState<{ row: Row; request: FocusRequest } | null>(null);
  useLayoutEffect(() => {
    const row = props.focusRequest && landingRow(props.focusRequest.query);
    if (!row || !props.focusRequest) return setLanded(null);
    setOpen(0);
    setLanded({ row, request: { ...props.focusRequest } });
  }, [props.focusRequest]);
  const skewRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (landed?.row !== "skew") return;
    requestAnimationFrame(() => {
      skewRef.current?.focus();
      skewRef.current?.select();
    });
  }, [landed]);

  // The rows inside, the embedded editors with the dialog's props (their own focus and search aside). What they'd
  // say in the dialog's footer (rotate's and translate's "Add perspective") goes in the panel's, where they are.
  const [rowHint, setRowHint] = useState<ComponentChildren | null>(null);
  const inner = { ...props, focusRequest: undefined, query: "", onHint: setRowHint };
  const ownRows = () =>
    OWN.map((p) => {
      const editor = p === "translate" ? translateEditor : p === "rotate" ? rotateEditor : scaleEditor;
      const focus = landed?.row === p ? { focusRequest: landed.request, query: landed.request.query } : {};
      return <editor.component key={p} {...inner} {...focus} />;
    });

  return (
    <LayerList
      label={PROPERTY}
      class="transform-editor"
      items={chips.map(({ remove: _, ...item }) => item)}
      mixed={isMixed(props, PROPERTY)}
      open={open}
      onOpen={setOpen}
      onAdd={() => setOpen(0)}
      // One panel holds it all: + only opens it while nothing's set (then the chip does).
      noAdd={chips.length > 0}
      onRemove={(i) => chips[i]?.remove()}
      noun="transform"
      panelTitle="Transform"
      focusRequest={landed ? undefined : props.focusRequest}
      footer={rowHint ?? HINTS[mode]}
      single
    >
      {open !== null && (
        <>
          <PropertyRow label="type">
            <PropertySelect
              value={mode}
              options={MODES}
              label="transform type"
              clearable={false}
              // As box-shadow's and filter's type selects: each option's icon (the chip's), and a word on custom and none.
              hintFor={(m) => TAKES[m as Mode]}
              iconFor={(m) => typeIcon(m as Mode)}
              onChange={(m) => pick(m as Mode)}
            />
          </PropertyRow>
          {mode === "default" && (
            <>
              {ownRows()}
              <SkewRow inputRef={skewRef} skew={skew ?? { x: "", y: "" }} onSkew={(next, gesture) => writeTransform(formatSkew(next), gesture)} onRevert={(gesture) => props.onRevert?.(PROPERTY, gesture)} />
            </>
          )}
          {mode === "custom" && (
            <>
              <PropertyRow label="value">
                <PropertyInputText
                  value={draft ?? (shown === "none" ? "" : shown)}
                  label="transform value"
                  placeholder="translate(3px) rotate(5deg)"
                  onCommit={(text) => {
                    if (!text.trim()) return writeCustom("");
                    const next = parseTransformText(text);
                    if (next) writeCustom(next);
                  }}
                />
              </PropertyRow>
            </>
          )}
        </>
      )}
    </LayerList>
  );
}

type Row = (typeof OWN)[number] | "skew";

/** A value's parts (`3px 4px` → two), none for nothing or `none`. */
function splitParts(value: string): string[] {
  const v = value.trim();
  return v && v !== "none" ? v.split(/\s+/) : [];
}

/** The row a search lands on: `translate-y` → translate, `skew-x-12` → skew; null for anything else (transform). */
function landingRow(query: string): Row | null {
  const q = normalizeQuery(query);
  for (const row of [...OWN, "skew"] as const) if (q.startsWith(row)) return row;
  return null;
}

/** Skew's X and Y as transform functions: `skewX(10deg) skewY(5deg)`, only those set. */
function formatSkew(skew: { x: string; y: string }): string {
  return [skew.x && `skewX(${skew.x})`, skew.y && `skewY(${skew.y})`].filter(Boolean).join(" ");
}

/**
 * skew's row, rotate's and scale's way: one value (`10deg`, or `10deg 5deg` for X and Y), or split into X and Y by
 * the button at the row's right; angles, a bare number in degrees, with the dial. Written as skewX() and skewY().
 */
function SkewRow({
  inputRef,
  skew,
  onSkew,
  onRevert,
}: {
  inputRef?: { current: HTMLInputElement | null };
  skew: { x: string; y: string };
  onSkew(next: { x: string; y: string }, gesture?: object): void;
  onRevert(gesture: object): void;
}) {
  const [view, setView] = useState<"one" | "axes">(() => (skew.y ? "axes" : "one"));
  const toggle = (
    <Tooltip text={view === "one" ? "Split" : "One value"}>
      <button
        type="button"
        class="split-toggle"
        aria-label={view === "one" ? "Skew each axis" : "One skew value"}
        aria-pressed={view === "axes"}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setView(view === "one" ? "axes" : "one")}
      >
        {view === "one" ? <Icon name="skew-all" /> : (["x", "y"] as const).map((a) => <Icon key={a} name={`skew-${a}`} />)}
      </button>
    </Tooltip>
  );
  if (view === "one") {
    // X, and Y after it when set: `10deg 5deg`.
    const text = skew.y ? `${skew.x || "0deg"} ${skew.y}` : skew.x;
    return (
      <div class="split-editor" data-view="one">
        <PropertyRow label="skew" action={toggle}>
          <PropertyInputText
            value={text}
            label="skew value"
            inputRef={inputRef}
            placeholder="0deg"
            onCommit={(typed) => {
              const parts = typed.trim() ? typed.trim().split(/\s+/) : [];
              if (parts.length > 2) return;
              const [x, y] = parts.map((p) => parseAngle(p));
              if (x === null || y === null) return;
              const next = { x: x ?? "", y: y ?? "" };
              if (next.x !== skew.x || next.y !== skew.y) onSkew(next);
            }}
            onStep={(delta, t, gesture) => {
              if (/\s/.test(t.trim())) return;
              const next = stepAngle(t, delta);
              if (next) onSkew({ ...skew, x: next }, gesture);
            }}
            onScrub={(steps, startText, gesture) => {
              if (steps === 0) return void onRevert(gesture);
              if (/\s/.test(startText.trim())) return;
              const next = stepAngle(startText, steps);
              if (next) onSkew({ ...skew, x: next }, gesture);
            }}
            dial
          />
        </PropertyRow>
      </div>
    );
  }
  return (
    <div class="split-editor" data-view="axes">
      <PropertyRow
        label={
          <span class="row-labels">
            <span>skew-x</span>
            <span>skew-y</span>
          </span>
        }
        class="parts"
        action={toggle}
      >
        <div class="stack">
          {(["x", "y"] as const).map((axis) => (
            <span key={axis} class="field">
              <PropertyInputText
                value={skew[axis]}
                label={`skew ${axis}`}
                inputRef={axis === "x" ? inputRef : undefined}
                placeholder="0deg"
                onCommit={(text) => {
                  const next = text.trim() ? parseAngle(text) : "";
                  if (next !== null && next !== skew[axis]) onSkew({ ...skew, [axis]: next });
                }}
                onStep={(delta, text, gesture) => {
                  const next = stepAngle(text, delta);
                  if (next) onSkew({ ...skew, [axis]: next }, gesture);
                }}
                onScrub={(steps, startText, gesture) => {
                  if (steps === 0) return void onRevert(gesture);
                  const next = stepAngle(startText, steps);
                  if (next) onSkew({ ...skew, [axis]: next }, gesture);
                }}
                dial
              />
            </span>
          ))}
        </div>
      </PropertyRow>
    </div>
  );
}

export const transformEditor: PropertyEditor = {
  id: PROPERTY,
  label: "Transform",
  // What it writes, so searching any of them finds it (its panel's rows aren't searched on their own).
  properties: [PROPERTY, ...OWN],
  // Its panel's rows: their values are its, and it's listed when any is set.
  embeds: [translateEditor, rotateEditor, scaleEditor],
  listsEmbeds: true,
  // Tailwind's classes for all of it: transform's (skew-*, transform-none, transform-gpu) and its rows'.
  aliases: [
    "skew-12",
    "skew-x-12",
    "skew-y-12",
    "transform-none",
    "transform-gpu",
    ...(translateEditor.aliases ?? []),
    ...(rotateEditor.aliases ?? []),
    ...(scaleEditor.aliases ?? []),
  ],
  component: TransformEditor,
};
