import type { PropSpec, PropValue } from "@pilot/protocol";

/**
 * Props in the comment's words: a value picked from the agent's `/props`
 * list writes a `name: value` line into the comment being written (one per
 * prop, replaced when it's picked again), and the designer can type one
 * too. Sent, the lines that name one of the listed props with a value it
 * takes are read back (propsInText), so the agent gets them exact and Pilot
 * checks them on the page.
 */

const LINE = /^\s*([A-Za-z_$][\w$-]*)\s*:\s*(.*?)\s*,?\s*$/;

/** `text` with `name`'s line set to `value` (added at the end if it has none), or taken out (`null`). */
export function withPropLine(text: string, name: string, value: PropValue | null): string {
  const lines = text ? text.split("\n") : [];
  const at = lines.findIndex((l) => LINE.exec(l)?.[1] === name);
  if (value === null) {
    if (at >= 0) lines.splice(at, 1);
    return lines.join("\n");
  }
  const line = `${name}: ${String(value)}`;
  if (at >= 0) lines[at] = line;
  else if (lines.length && !lines.at(-1)?.trim()) lines[lines.length - 1] = line;
  else lines.push(line);
  return lines.join("\n");
}

/** The props `text` sets: its `name: value` lines for the listed props, each value as the prop takes it (the last line for a name wins). */
export function propsInText(text: string, specs: readonly PropSpec[]): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const line of text.split("\n")) {
    const m = LINE.exec(line);
    const spec = m && specs.find((s) => s.name === m[1]);
    if (!spec) continue;
    const value = valueFor(spec, (m[2] as string).replace(/^["'`](.*)["'`]$/, "$1"));
    if (value !== undefined) out[spec.name] = value;
  }
  return out;
}

function valueFor(spec: PropSpec, typed: string): PropValue | undefined {
  if (!typed) return undefined;
  if (spec.type === "boolean") return /^(true|yes|on)$/i.test(typed) ? true : /^(false|no|off)$/i.test(typed) ? false : undefined;
  if (spec.type === "number") return Number.isFinite(Number(typed)) ? Number(typed) : undefined;
  if (spec.type === "options") return spec.options?.find((o) => o.toLowerCase() === typed.toLowerCase());
  return typed;
}
