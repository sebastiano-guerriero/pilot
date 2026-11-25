import type { PropSpec, PropValue } from "@pilot/protocol";

/**
 * Props in the comment's words: the agent's `/props` list says to reply with
 * a `name: value` line to change one (PropsList). Sent, the lines that name
 * one of the listed props with a value it takes are read back
 * (propsInText), so the agent gets them exact and Pilot checks them on the page.
 */

const LINE = /^\s*([A-Za-z_$][\w$-]*)\s*:\s*(.*?)\s*,?\s*$/;

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
