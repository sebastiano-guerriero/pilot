import type { PropSpec, PropValue } from "@pilot/protocol";

interface PropsListProps {
  /** The component's props, as the agent listed them (`/props`). */
  props: PropSpec[];
  /** The instance's props now, read from the page (see componentProps): each line shows its value. */
  current: Record<string, PropValue>;
}

/** The most values an options prop lists before "…". */
const MAX_OPTIONS = 6;

/** What a prop takes, as a few words: the agent's description, then the values it accepts (`sm, md or lg`). */
export function propHint(p: PropSpec): string {
  const options = p.type === "options" && p.options?.length ? orList(p.options) : "";
  const takes = options || (p.type === "boolean" ? "true or false" : p.type === "number" ? "a number" : "text");
  return p.description ? (options ? `${p.description}: ${options}` : p.description) : takes;
}

function orList(values: readonly string[]): string {
  const shown = values.slice(0, MAX_OPTIONS);
  if (values.length > MAX_OPTIONS) return `${shown.join(", ")}…`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} or ${shown.at(-1)}` : (shown[0] ?? "");
}

/**
 * How to change one, from the first prop: `tone: dark` (another of its
 * values), `featured: false` (the other one), `count: …` (anything typed).
 */
export function propExample(p: PropSpec, now: PropValue | undefined): string {
  const other =
    p.type === "options" ? p.options?.find((o) => o !== String(now)) : p.type === "boolean" ? String(!(now ?? p.default ?? false)) : undefined;
  return `${p.name}: ${other ?? "…"}`;
}

/**
 * The agent's reply to `/props`, in its own message (the owner's call,
 * 2026-11-25: light, a bullet per prop, no box of fields): the prop's name,
 * its value on this instance (else its default), and what it takes, dimmed.
 * Then how to change one: a `name: value` line in the reply, which goes to
 * the agent exact (propsInText). Before: a box of the property dialog's
 * fields under the reply, a pick writing that line; fields suggested a
 * preview the page can't give (props need the code).
 */
export function PropsList({ props, current }: PropsListProps) {
  const now = (p: PropSpec) => current[p.name] ?? p.default;
  const first = props[0];
  return (
    <>
      <ul class="props-list" aria-label="Props">
        {props.map((p) => (
          <li key={p.name}>
            <code>{p.name}</code>
            {now(p) !== undefined && <span class="prop-value">{String(now(p))}</span>}
            <span class="prop-hint">{propHint(p)}</span>
          </li>
        ))}
      </ul>
      {first && (
        <p class="props-how">
          Reply <code>{propExample(first, now(first))}</code> to change {props.length > 1 ? "one" : "it"}.
        </p>
      )}
    </>
  );
}
