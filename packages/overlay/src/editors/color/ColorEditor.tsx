import { useLayoutEffect, useRef } from "preact/hooks";
import { joinColor, parseColor, parseOpacity, splitColor } from "../../css/colors.ts";
import { Icon } from "../../ui/components/Icon/Icon.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { declaredOf } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/** Whether a color carries its own alpha (8-digit hex, rgba / slash syntax): it then sets the opacity too. */
function hasAlpha(color: string): boolean {
  return /^#[0-9a-f]{8}$/i.test(color) || /^rgba?\([^)]*(?:,[^,)]*){3}\)$/i.test(color) || /^rgba?\([^)]*\/[^)]*\)$/i.test(color);
}

/**
 * `color`, in two fields sharing the value area: the color (a swatch, then
 * its hex, or how the page names it: `var(--brand)`) and its opacity, 0–100,
 * in a 45px field with a drag handle. Both write one value (css/colors.ts):
 * `#000000`, `#00000080` at 50%, or `color-mix(…)` for a named color below
 * 100. The swatch shows the color the element ends up with (computed); with
 * no color set, the field shows the "nothing set" icon instead, like a select
 * with icons does.
 * - A typed hex with alpha (`00000080`) sets the opacity too; any other color
 *   keeps the opacity as it is.
 * - Clearing the color removes it (the element doesn't set a color);
 *   clearing the opacity makes it 100.
 * Tab goes color → opacity → next editor.
 */
function ColorEditor(props: PropertyEditorProps) {
  const { onChange, onRevert, values, focusRequest, onReturnToSearch, onTabOut } = props;
  const value = declaredOf(props, "color");
  const { color, opacity } = splitColor(value);
  const colorRef = useRef<HTMLInputElement>(null);
  const opacityRef = useRef<HTMLInputElement>(null);

  const focus = (ref: typeof colorRef) => {
    ref.current?.focus();
    ref.current?.select();
  };
  useLayoutEffect(() => {
    if (focusRequest) focus(focusRequest.edge === "last" ? opacityRef : colorRef);
  }, [focusRequest]);
  const tabOut = (direction: 1 | -1) => (onTabOut ? onTabOut(direction) : onReturnToSearch?.());

  const write = (next: string, gesture?: object) => {
    if (next !== value) onChange("color", next, gesture ? { gesture } : undefined);
  };
  const setOpacity = (o: number, gesture?: object) => {
    if (color) write(joinColor(color, o), gesture);
  };

  const swatch = color ? (
    <span class="color-swatch" style={{ background: values?.color || "transparent" }} />
  ) : (
    <Icon name="layout-empty" />
  );

  return (
    <PropertyRow label="color">
      <div class="color-editor">
        <PropertyInputText
          value={color}
          label="color"
          icon={swatch}
          inputRef={colorRef}
          onCommit={(text) => {
            if (!text.trim()) return write("");
            const typed = parseColor(text);
            if (!typed) return;
            const parts = splitColor(typed);
            write(joinColor(parts.color, hasAlpha(typed) ? parts.opacity : (opacity ?? 100)));
          }}
          onSubmit={onReturnToSearch}
          onTab={(direction) => (direction > 0 ? focus(opacityRef) : tabOut(-1))}
        />
        <PropertyInputText
          value={opacity === null ? "" : String(opacity)}
          label="color opacity"
          inputRef={opacityRef}
          onCommit={(text) => {
            if (!text.trim()) return setOpacity(100);
            const o = parseOpacity(text);
            if (o !== null) setOpacity(o);
          }}
          onStep={(delta, text) => setOpacity((parseOpacity(text) ?? opacity ?? 100) + delta)}
          onScrub={(steps, startText, gesture) => {
            const start = parseOpacity(startText) ?? opacity ?? 100;
            const next = Math.min(100, Math.max(0, start + steps));
            if (next === start) return onRevert?.("color", gesture);
            setOpacity(next, gesture);
          }}
          onSubmit={onReturnToSearch}
          onTab={(direction) => (direction > 0 ? tabOut(1) : focus(colorRef))}
        />
      </div>
    </PropertyRow>
  );
}

export const colorEditor: PropertyEditor = {
  id: "color",
  label: "Color",
  properties: ["color"],
  component: ColorEditor,
};
