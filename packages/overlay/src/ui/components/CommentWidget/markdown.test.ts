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

  it("headings bold, quotes plain, links as their text", () => {
    expect(html("## Done")).toBe("<p><strong>Done</strong></p>");
    expect(html("> quoted")).toBe("<p>quoted</p>");
    expect(html("See [the docs](https://example.com)")).toBe("<p>See the docs</p>");
  });

  it("never HTML: tags show as text", () => {
    expect(html('<img src=x onerror="alert(1)">')).toBe("<p>&lt;img src=x onerror=\"alert(1)\"&gt;</p>");
  });

  it("a list after a blank line is a new list", () => {
    expect(blocks("- a\n\n- b")).toHaveLength(2);
  });
});
