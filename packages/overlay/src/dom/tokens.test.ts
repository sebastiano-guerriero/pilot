// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { fileTokensOf } from "../edits/changeSet.ts";
import { mentionables } from "./mentions.ts";
import { allTokens, FILE_TOKENS_ATTRIBUTE, fileTokenVariable, kindOf, pageTokens, setFileTokens } from "./tokens.ts";

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

describe("the project's file tokens", () => {
  it("become CSS variables of Pilot's own, defined in a sheet of its own, listed after the page's; one the page has stays the page's", () => {
    style(":root { --brand: #000; }");
    setFileTokens([
      { name: "color.brand.primary", value: "#1cf69e", file: "tokens/colors.json", line: 3 },
      { name: "$brand", value: "#ff0000", file: "_variables.scss", line: 1 },
      { name: "space.4", value: "16px", file: "tokens/space.json" },
    ]);
    expect(fileTokenVariable("color.brand.primary")).toBe("--color-brand-primary");
    expect(fileTokenVariable("$brand-500")).toBe("--brand-500");
    const sheet = document.querySelector(`style[${FILE_TOKENS_ATTRIBUTE}]`);
    expect(sheet?.textContent).toBe(":root { --color-brand-primary: #1cf69e; --space-4: 16px; }");
    expect(allTokens().map((t) => [t.name, t.source?.name])).toEqual([
      ["--brand", undefined],
      ["--color-brand-primary", "color.brand.primary"],
      ["--space-4", "space.4"],
    ]);
    // Pilot's own sheet isn't the page's: not read as its tokens.
    expect(pageTokens().map((t) => t.name)).toEqual(["--brand"]);
    // A change set says which of them its values use, for the agent.
    const target = { selector: "a", path: "a", tag: "a", classes: [] };
    expect(fileTokensOf([{ target, changes: [{ property: "color", from: "", to: "var(--color-brand-primary)" }] }])).toEqual({
      fileTokens: [{ variable: "--color-brand-primary", name: "color.brand.primary", value: "#1cf69e", file: "tokens/colors.json", line: 3 }],
    });
    expect(fileTokensOf([{ target, changes: [{ property: "color", from: "", to: "var(--brand)" }] }])).toEqual({});
    setFileTokens([]);
    expect(document.querySelector(`style[${FILE_TOKENS_ATTRIBUTE}]`)).toBeNull();
  });
});

