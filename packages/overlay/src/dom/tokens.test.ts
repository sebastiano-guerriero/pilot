// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { mentionables } from "./mentions.ts";
import { kindOf, pageTokens } from "./tokens.ts";

const style = (css: string, attrs: Record<string, string> = {}) => {
  const el = document.createElement("style");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.textContent = css;
  document.head.append(el);
};

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("page tokens", () => {
  // (@layer too, in a browser: happy-dom drops its rules.)
  it("the variables defined on the root (:root, html, inside @media), with their values; not elsewhere, not Tailwind's plumbing", () => {
    style(`
      :root { --color-accent: #1cf69e; --space-2: 8px; --tw-ring-offset: 0px; }
      html { --font-sans: Inter, sans-serif; }
      @media (min-width: 1px) { :root, .dark { --radius: 0.5rem; } }
      .card { --card-only: red; }
    `);
    expect(pageTokens().map((t) => [t.name, t.value, t.kind])).toEqual([
      ["--color-accent", "#1cf69e", "color"],
      ["--space-2", "8px", "length"],
      ["--font-sans", "Inter, sans-serif", "font"],
      ["--radius", "0.5rem", "length"],
    ]);
  });

  it("skips Pilot's own preview sheet", () => {
    style(":root { --mine: 1px; }", { "data-pilot-preview": "" });
    expect(pageTokens()).toEqual([]);
  });

  it("kinds, by the value first", () => {
    expect(kindOf("--z", "10")).toBe("number");
    expect(kindOf("--gap", "calc(1rem + 2px)")).toBe("length");
    expect(kindOf("--bg", "oklch(0.7 0.1 150)")).toBe("color");
    expect(kindOf("--font-mono", "Menlo")).toBe("font");
    expect(kindOf("--shadow", "0 1px 2px black")).toBe("other");
    expect(kindOf("--ease", "cubic-bezier(0.2, 0, 0, 1)")).toBe("other");
  });
});

describe("mentionables", () => {
  it("named elements (an id, a naming attribute) once each; plain tags and Pilot's own aren't listed", () => {
    document.body.innerHTML = `
      <section id="features"><div><p>Hi</p></div></section>
      <button data-testid="buy">Buy</button>
      <pilot-root><div id="pilot-thing"></div></pilot-root>
    `;
    const { elements, components } = mentionables(["data-testid"]);
    expect(elements.map((e) => e.name)).toEqual(["section#features", "button[data-testid=buy]"]);
    expect(components).toEqual([]);
  });
});
