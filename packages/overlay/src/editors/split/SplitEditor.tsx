import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { displayValue, parseValue, stepValue } from "../../css/values.ts";
import type { BoxArea } from "../../dom/boxModel.ts";
import { Icon, type IconName } from "../../ui/components/Icon/Icon.tsx";
import { type InputDraft, PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { declaredOf } from "../declared.ts";
import { useScrub } from "../length/useScrub.ts";
import { normalizeQuery } from "../query.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/** One of the properties a shorthand splits into: a side of padding, row-gap… */
export interface SplitPart {
  /** Its key in the editor: `top`, `row`… (not "all"). */
  key: string;
  /** The CSS property its field writes: `padding-top`, `row-gap`. */
  property: string;
  /** The field's accessible name: `padding top`, `row-gap`. */
  label: string;
  /** Its icon in the view button (sides view): `side-top`, `gap-row`. */
  icon: IconName;
  /** What its field shows on the page while hovered or focused; nothing when absent (inset). */
  area?: BoxArea;
  /**
   * Search words that land on this part (besides its property): Tailwind's
   * (`pt`, `gap-y`) and the logical properties for it (`padding-block-start`).
   */
  aliases: string[];
}

/** A shorthand that can be set as one value, or split into its parts (padding, margin, gap). */
export interface SplitConfig {
  /** Editor id, e.g. "padding". */
  id: string;
  /** Search label, e.g. "Padding". */
  label: string;
  /** The row's label, e.g. "padding". */
  title: string;
  /** The shorthand the one-value field writes: `padding`, `gap`. */
  shorthand: string;
  /** The view button's icon in the one-value view: `sides-all`, `gap-all`. */
  icon: IconName;
  /**
   * Search words that land on the one value (`p`, `gap`). Otherwise the
   * editor's label and shorthand (`padding`) keep the view.
   */
  allAliases?: string[];
  /** The parts, in field (and Tab) order. */
  parts: SplitPart[];
  /**
   * Pairs of parts a typed value sets together (`px`, `padding-inline` →
   * right and left): the search lands on the first part, the other mirrors it.
   */
  pairs?: Array<{ aliases: string[]; parts: [string, string] }>;
}

type View = "all" | "parts";
/** A field: the one-value field ("all") or a part's key. */
type Field = string;

/**
 * Where a search lands, as soon as it's typed (the view) and on Tab (the
 * field): an all alias (`p`) → the one value; a part's alias or property
 * (`pl`, `padding-left`, `padding-inline-start`, `gap-y`, `row-gap`) → the
 * parts, on that part; a pair's (`px`, `padding-inline`) → the parts, on the
 * first of the pair, and a value typed there sets both: the other field
 * mirrors it (its text shows selected too, then what's typed). Anything else
 * (`padding`, `pad`) keeps the view and lands on its first field.
 */
export function landing(config: SplitConfig, query: string): { view?: View; field?: Field; linked?: string[] } {
  const q = normalizeQuery(query);
  if (!q) return {};
  const is = (names: readonly string[]) => names.some((n) => q === normalizeQuery(n));
  if (is(config.allAliases ?? [])) return { view: "all", field: "all" };
  for (const pair of config.pairs ?? []) {
    if (is(pair.aliases)) return { view: "parts", field: pair.parts[0], linked: [...pair.parts] };
  }
  for (const part of config.parts) {
    if (is([part.property, ...part.aliases])) return { view: "parts", field: part.key };
  }
  return {};
}

/**
 * A shorthand (padding, margin, gap) as one value, or one value per part
 * (each side, row and column gap). The button at the right of the row
 * switches between the two views; it changes nothing on the page.
 *
 * - **One value** (`all`): a single field. It takes one value, not the
 *   shorthand's list (`12px 16px` isn't accepted), and writes the shorthand
 *   (`padding: 12px`). When the parts differ, it's empty and reads "Mixed";
 *   a value typed there sets them all. Clearing it clears every part.
 * - **Each part** (`parts`): one field per part, each writing its property.
 *
 * The search picks the view as it's typed (see landing); otherwise it opens
 * on the parts when they differ, on one value when they match. The fields
 * are PropertyInputText with a drag handle, so they accept what every Pilot
 * field accepts (`12` as px, units, keywords, math). Hovering or focusing a
 * field shows its area on the page (every part's for the one value).
 */
export function SplitEditor({
  config,
  element,
  values,
  declared,
  onChange,
  onRevert,
  query = "",
  focusRequest,
  onReturnToSearch,
  onTabOut,
  onInspect,
}: PropertyEditorProps & { config: SplitConfig }) {
  const { title, parts } = config;
  const keys = parts.map((p) => p.key);
  const partOf = (key: Field) => parts.find((p) => p.key === key) as SplitPart;
  const first = parts[0] as SplitPart;
  // Each part as declared (from any source, Pilot's included), "" when unset.
  const value = Object.fromEntries(parts.map((p) => [p.key, declaredOf({ element, declared }, p.property)])) as Record<
    string,
    string
  >;
  const same = parts.every((p) => value[p.key] === value[first.key]);
  const mixed = !same;

  // The search picks the view as it's typed (`px` → each part); otherwise
  // it opens on the parts when they differ, on one value when they match.
  const [view, setView] = useState<View>(() => landing(config, query).view ?? (same ? "all" : "parts"));
  useLayoutEffect(() => {
    const target = landing(config, query).view;
    if (target) setView(target);
  }, [query]);
  // Parts a value typed in `field` also sets (px/py), while focus stays on it.
  const [linked, setLinked] = useState<{ field: Field; parts: string[] } | null>(null);
  // What's being edited in the linked field: its partner shows it (the
  // selection while it's selected, the text once typed), so both read as one.
  const [draft, setDraft] = useState<InputDraft | null>(null);
  useEffect(() => {
    if (!linked) setDraft(null);
  }, [linked]);
  const root = useRef<HTMLDivElement>(null);
  // The field to focus after a render (from the search, Tab, or a view switch).
  const [pending, setPending] = useState<{ field: Field } | null>(null);

  const refs = useRef<Record<Field, { current: HTMLInputElement | null }>>(
    Object.fromEntries(["all", ...keys].map((k) => [k, { current: null }])),
  );

  // From the search (or another editor): pick the view and field the query
  // asks for; from the previous/next editor, the first/last field.
  useLayoutEffect(() => {
    if (!focusRequest) return;
    const target = landing(config, focusRequest.query);
    const nextView = target.view ?? view;
    if (target.view) setView(target.view);
    const firstField: Field = nextView === "all" ? "all" : focusRequest.edge === "last" ? (keys.at(-1) as string) : first.key;
    const field = target.field ?? firstField;
    setLinked(target.linked ? { field, parts: target.linked } : null);
    setPending({ field });
  }, [focusRequest]);
  useLayoutEffect(() => {
    if (!pending) return;
    const input = refs.current[pending.field]?.current;
    input?.focus();
    input?.select();
    setPending(null);
  }, [pending]);

  // The field hovered and the one focused; its area shows on the page.
  const [hovered, setHovered] = useState<Field | null>(null);
  const [focused, setFocused] = useState<Field | null>(null);
  const inspecting = focused ?? hovered;
  useLayoutEffect(() => {
    if (!inspecting) return onInspect?.(null);
    const areas = (inspecting === "all" ? parts : [partOf(inspecting)]).flatMap((p) => (p.area ? [p.area] : []));
    onInspect?.(areas.length ? areas : null);
  }, [inspecting]);
  useEffect(() => () => onInspect?.(null), []);

  const scrub = useScrub({ onChange, onRevert });
  // ↑/↓ and drags on an empty field start from the part's computed value.
  const baseOf = (part: SplitPart) => () => {
    const computed = values[part.property];
    return computed && Number.isFinite(Number.parseFloat(computed)) ? computed : "0px";
  };

  // The one value: written as the shorthand; cleared on every part (each a
  // removal where the page sets it), as one undo step.
  const commitAll = (text: string) => {
    if (!text.trim()) {
      const gesture = {};
      onChange(config.shorthand, "", { gesture });
      for (const p of parts) onChange(p.property, "", { gesture });
      return;
    }
    const next = parseValue(first.property, text);
    if (next && (mixed || next !== value[first.key])) onChange(config.shorthand, next);
  };

  // A part; with a pair, its partner too (one undo step).
  const commitPart = (key: Field, text: string) => {
    const targets = linked?.field === key ? linked.parts : [key];
    const next = text.trim() ? parseValue(partOf(key).property, text) : "";
    if (next === null) return;
    const changed = targets.filter((t) => value[t] !== next);
    if (!changed.length) return;
    const gesture = {};
    for (const t of changed) onChange(partOf(t).property, next, { gesture });
  };

  // Tab moves through the parts; past either end, on to the next editor.
  const tab = (field: Field, direction: 1 | -1) => {
    const order: Field[] = view === "all" ? ["all"] : keys;
    const next = order.indexOf(field) + direction;
    if (next >= 0 && next < order.length) setPending({ field: order[next] as Field });
    else if (onTabOut) onTabOut(direction);
    else onReturnToSearch?.();
  };

  const fieldEvents = (field: Field) => ({
    onPointerEnter: () => setHovered(field),
    onPointerLeave: () => setHovered((h) => (h === field ? null : h)),
    onFocusIn: () => {
      setFocused(field);
      setLinked((l) => (l && l.field !== field ? null : l));
    },
    onFocusOut: (e: FocusEvent) => {
      setFocused((f) => (f === field ? null : f));
      if (!root.current?.contains(e.relatedTarget as Node | null)) setLinked(null);
    },
  });

  // Switching views changes nothing on the page. When a field had focus, the
  // new view's first field takes it.
  const toggle = () => {
    const next: View = view === "all" ? "parts" : "all";
    setView(next);
    setLinked(null);
    if (focused) setPending({ field: next === "all" ? "all" : first.key });
  };
  const toggleButton = (
    <button
      type="button"
      class="split-toggle"
      aria-label={view === "all" ? `Set each part of ${title}` : `One value for all of ${title}`}
      aria-pressed={view === "parts"}
      title={view === "all" ? "Split" : "One value"}
      tabIndex={-1}
      // Keep focus where it is (a field, or the search) while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
    >
      {view === "all" ? <Icon name={config.icon} /> : parts.map((p) => <Icon key={p.key} name={p.icon} />)}
    </button>
  );

  return (
    <div ref={root} class="split-editor" data-view={view}>
      {view === "all" ? (
        <PropertyRow label={title} action={toggleButton}>
          <span class="field" {...fieldEvents("all")}>
            <PropertyInputText
              value={same && value[first.key] ? displayValue(value[first.key] as string, first.property) : ""}
              placeholder={mixed ? "Mixed" : undefined}
              label={title}
              inputRef={refs.current.all}
              onCommit={commitAll}
              onStep={(delta, text) => {
                const next = stepValue(first.property, text, delta, baseOf(first)());
                if (next) onChange(config.shorthand, next);
              }}
              onScrub={(steps, text, gesture) =>
                scrub({ property: first.property, writes: config.shorthand, base: baseOf(first) }, steps, text, gesture)
              }
              onSubmit={onReturnToSearch}
              onTab={(direction) => tab("all", direction)}
            />
          </span>
        </PropertyRow>
      ) : (
        <PropertyRow label={title} class="parts" action={toggleButton}>
          <div class="stack">
            {parts.map((part) => (
              <span key={part.key} class="field" {...fieldEvents(part.key)}>
                <PropertyInputText
                  value={value[part.key] ? displayValue(value[part.key] as string, part.property) : ""}
                  label={part.label}
                  inputRef={refs.current[part.key]}
                  onCommit={(text) => commitPart(part.key, text)}
                  onStep={(delta, text) => {
                    const next = stepValue(part.property, text, delta, baseOf(part)());
                    if (next && next !== value[part.key]) onChange(part.property, next);
                  }}
                  onScrub={(steps, text, gesture) =>
                    scrub({ property: part.property, base: baseOf(part) }, steps, text, gesture)
                  }
                  onSubmit={onReturnToSearch}
                  onTab={(direction) => tab(part.key, direction)}
                  onDraft={linked?.field === part.key ? setDraft : undefined}
                  mirror={
                    linked && linked.field !== part.key && linked.parts.includes(part.key)
                      ? (draft ?? undefined)
                      : undefined
                  }
                />
              </span>
            ))}
          </div>
        </PropertyRow>
      )}
    </div>
  );
}

/**
 * Define a split editor. The search finds it by its label, its properties
 * (the shorthand and each part's), and the aliases (all, parts', pairs').
 */
export function splitEditor(config: SplitConfig): PropertyEditor {
  const aliases = [
    ...(config.allAliases ?? []),
    ...(config.pairs ?? []).flatMap((p) => p.aliases),
    ...config.parts.flatMap((p) => p.aliases),
  ];
  return {
    id: config.id,
    label: config.label,
    properties: [config.shorthand, ...config.parts.map((p) => p.property)],
    aliases,
    component: (props: PropertyEditorProps) => <SplitEditor {...props} config={config} />,
  };
}
