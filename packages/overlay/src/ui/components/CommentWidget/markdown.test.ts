// @vitest-environment happy-dom
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import { blocks, renderMarkdown } from "./markdown.tsx";

const html = (text: string) => {
  const container = document.createElement("div");
  render(h("div", null, renderMarkdown(text)), container);
  return (container.firstElementChild as HTMLElement).innerHTML;
};

describe("renderMarkdown", () => {
  it("paragraphs, a single newline as a line break", () => {
    expect(html("One\ntwo\n\nThree")).toBe("<p>One<br>two</p><p>Three</p>");
  });

  it("bold, italic and inline code; underscores in names stay", () => {
    expect(html("**Bold** and *it* with `pt-6` in snake_case_name")).toBe(
      "<p><strong>Bold</strong> and <em>it</em> with <code>pt-6</code> in snake_case_name</p>",
    );
    expect(html("`**not bold**`")).toBe("<p><code>**not bold**</code></p>");
    expect(html("2 * 3 * 4")).toBe("<p>2 * 3 * 4</p>");
  });

  it("bulleted and numbered lists, an indented line continuing its item", () => {
    expect(html("Changed:\n- padding\n- radius\n  to 8px")).toBe("<p>Changed:</p><ul><li>padding</li><li>radius to 8px</li></ul>");
    expect(html("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
    expect(html("3) three")).toBe('<ol start="3"><li>three</li></ol>');
  });

  it("fenced code as is, also without a closing fence", () => {
    expect(html("```css\n.a { color: red; }\n**x**\n```")).toBe("<pre><code>.a { color: red; }\n**x**</code></pre>");
    expect(html("```\nopen")).toBe("<pre><code>open</code></pre>");
  });

  it("headings bold, quotes plain", () => {
    expect(html("## Done")).toBe("<p><strong>Done</strong></p>");
    expect(html("> quoted")).toBe("<p>quoted</p>");
  });

  it("web addresses are links, opened in a new tab with nothing passed back: [text](url) and written out", () => {
    const a = (href: string, text = href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    expect(html("See [the docs](https://example.com)")).toBe(`<p>See ${a("https://example.com", "the docs")}</p>`);
    expect(html("**URL:**\nhttp://localhost:5188/states/button/")).toBe(`<p><strong>URL:</strong><br>${a("http://localhost:5188/states/button/")}</p>`);
    // The punctuation that ends a sentence isn't part of it.
    expect(html("Open http://localhost:5188/x.")).toBe(`<p>Open ${a("http://localhost:5188/x")}.</p>`);
    expect(html("(see https://example.com/a?b=1)")).toBe(`<p>(see ${a("https://example.com/a?b=1")})</p>`);
    // In code, it's code.
    expect(html("`http://localhost:5188`")).toBe("<p><code>http://localhost:5188</code></p>");
  });

  it("only web addresses: any other kind stays text", () => {
    expect(html("[click](javascript:alert(1))")).toBe("<p>click)</p>");
    expect(html("[mail](mailto:a@b.c)")).toBe("<p>mail</p>");
    expect(html("javascript:alert(1)")).toBe("<p>javascript:alert(1)</p>");
  });

  it("never HTML: tags show as text", () => {
    expect(html('<img src=x onerror="alert(1)">')).toBe("<p>&lt;img src=x onerror=\"alert(1)\"&gt;</p>");
  });

  it("a list after a blank line is a new list", () => {
    expect(blocks("- a\n\n- b")).toHaveLength(2);
  });
});
